import type { AppConfig } from "../config.js";
import { buildAuthorPostsInput, buildCommentsInput, buildPostsInput, buildProfileSearchInput, runApifyTask } from "./apify.js";
import type { ConvexGateway } from "./convex.js";
import { normalizeAuthorDiscoveryRecords, normalizeCommentRecords, normalizePostRecords } from "./normalize.js";
import { failedAuthorScore, failedScore, scoreAuthorRecord, scoreRecord } from "./openai.js";
import { sendDailyDigest } from "./telegram.js";
import type { AuthorDiscoveryRecord, AuthorScoreResult, StoredComment, StoredPost, TaskConfigRecord } from "./types.js";

type RunStats = {
  profileSearchQueries: number;
  authorsDiscovered: number;
  authorsScored: number;
  authorsSelected: number;
  authorPostsFetched: number;
  postsFetched: number;
  postsScored: number;
  commentsFetched: number;
  commentsScored: number;
};

type AuthorCandidate = AuthorDiscoveryRecord & {
  content_type: "author";
  sample_post_count?: number;
  sample_posts: Array<{
    canonical_id: string;
    url: string;
    text: string;
    keyword: string;
    posted_at: string;
    post_score?: number;
    relevance_tags?: string[];
  }>;
};

type ScoredAuthorCandidate = AuthorCandidate & {
  score: AuthorScoreResult;
};

const parseTextList = (value: string): string[] =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const scorePost = async (post: StoredPost, appConfig: AppConfig, taskConfig: TaskConfigRecord): Promise<StoredPost> => {
  try {
    return {
      ...post,
      score: await scoreRecord(post, {
        apiKey: appConfig.openaiApiKey,
        model: taskConfig.openaiModel || appConfig.openaiScoringModel
      })
    };
  } catch (error) {
    return { ...post, score: failedScore(post, error) };
  }
};

const scoreAuthor = async (
  author: AuthorCandidate,
  appConfig: AppConfig,
  taskConfig: TaskConfigRecord
): Promise<ScoredAuthorCandidate> => {
  try {
    return {
      ...author,
      score: await scoreAuthorRecord(author, {
        apiKey: appConfig.openaiApiKey,
        model: taskConfig.openaiModel || appConfig.openaiScoringModel
      })
    };
  } catch (error) {
    return { ...author, score: failedAuthorScore(author, error) };
  }
};

const scoreComment = async (
  comment: StoredComment,
  appConfig: AppConfig,
  taskConfig: TaskConfigRecord
): Promise<StoredComment> => {
  try {
    return {
      ...comment,
      score: await scoreRecord(comment, {
        apiKey: appConfig.openaiApiKey,
        model: taskConfig.openaiModel || appConfig.openaiScoringModel
      })
    };
  } catch (error) {
    return { ...comment, score: failedScore(comment, error) };
  }
};

const authorScoreValue = (author: ScoredAuthorCandidate): number => author.score?.author_score ?? 0;

const buildCandidatesFromDiscovery = (records: AuthorDiscoveryRecord[]): AuthorCandidate[] => {
  const deduped = new Map<string, AuthorCandidate>();
  for (const record of records) {
    const existing = deduped.get(record.canonical_id);
    if (existing) continue;
    deduped.set(record.canonical_id, {
      ...record,
      content_type: "author",
      sample_post_count: 0,
      sample_posts: []
    });
  }

  return [...deduped.values()];
};

const buildCandidatesFromPosts = (posts: StoredPost[]): AuthorCandidate[] => {
  const authorGroups = new Map<
    string,
    {
      author: StoredPost["author"];
      posts: StoredPost[];
    }
  >();

  for (const post of posts) {
    const author = post.author;
    const canonicalId = author?.canonical_id || post.author_canonical_id || author?.id || "";
    if (!canonicalId) continue;

    const existing = authorGroups.get(canonicalId);
    if (existing) {
      existing.posts.push(post);
      continue;
    }

    authorGroups.set(canonicalId, {
      author,
      posts: [post]
    });
  }

  return [...authorGroups.entries()].map(([canonicalId, entry]) => {
    const discoveryQuery = [...new Set(entry.posts.map((post) => post.keyword).filter(Boolean))].join(", ");
    const samplePosts = entry.posts
      .slice()
      .sort((a, b) => (b.postScore ?? 0) - (a.postScore ?? 0) || (b.posted_at || "").localeCompare(a.posted_at || ""))
      .slice(0, 3)
      .map((post) => ({
        canonical_id: post.canonical_id,
        url: post.url,
        text: post.text,
        keyword: post.keyword,
        posted_at: post.posted_at,
        post_score: post.postScore,
        relevance_tags: post.score?.relevance_tags || post.relevanceTags || []
      }));

    return {
      canonical_id: canonicalId,
      content_type: "author",
      name: entry.author?.name || "Unknown author",
      url: entry.author?.url || "",
      role: entry.author?.role || "",
      type: entry.author?.type,
      discovery_query: discoveryQuery,
      sample_post_count: samplePosts.length,
      sample_posts: samplePosts,
      raw_source: {
        author: entry.author,
        sample_post_canonical_ids: samplePosts.map((sample) => sample.canonical_id)
      },
      seen_at: new Date().toISOString()
    };
  });
};

const topAuthorsForPosts = (authors: ScoredAuthorCandidate[], config: TaskConfigRecord): ScoredAuthorCandidate[] => {
  const ranked = authors
    .slice()
    .sort((a, b) => authorScoreValue(b) - authorScoreValue(a))
    .filter((author) => (author.score?.recommended_action || "ignore") !== "ignore");

  const selected = ranked.filter((author) => authorScoreValue(author) >= config.authorMinScore).slice(0, config.authorTopLimit);
  if (selected.length) return selected;

  return ranked.slice(0, Math.min(config.authorTopLimit, ranked.length));
};

const mergePostsByCanonicalId = (posts: StoredPost[]): StoredPost[] => {
  const merged = new Map<string, StoredPost>();
  for (const post of posts) {
    merged.set(post.canonical_id, post);
  }

  return [...merged.values()].sort((a, b) => (b.postScore ?? 0) - (a.postScore ?? 0) || (b.seen_at || "").localeCompare(a.seen_at || ""));
};

const topPostsForComments = (posts: StoredPost[], config: TaskConfigRecord): StoredPost[] =>
  posts
    .filter((post) => (post.authorScore ?? 0) >= config.authorMinScore)
    .filter((post) => (post.score?.post_score ?? 0) >= config.minPostScoreForComments)
    .filter((post) => post.engagement.comments > 0)
    .sort((a, b) => (b.score?.post_score ?? 0) - (a.score?.post_score ?? 0))
    .slice(0, config.topPostLimit);

const discoveryQueriesForConfig = (taskConfig: TaskConfigRecord): string[] => {
  const queries = parseTextList(taskConfig.profileSearchQueriesText);
  return queries.length ? queries : taskConfig.keywords;
};

export const runScoringPipeline = async (
  runId: string,
  taskConfig: TaskConfigRecord,
  appConfig: AppConfig,
  convex: ConvexGateway
) => {
  const stats: RunStats = {
    profileSearchQueries: 0,
    authorsDiscovered: 0,
    authorsScored: 0,
    authorsSelected: 0,
    authorPostsFetched: 0,
    postsFetched: 0,
    postsScored: 0,
    commentsFetched: 0,
    commentsScored: 0
  };

  const discoveryQueries = discoveryQueriesForConfig(taskConfig);
  stats.profileSearchQueries = discoveryQueries.length;
  await convex.mutation("runs.updateStatus", {
    id: runId,
    status: "running",
    message: "Searching for relevant fashion authors.",
    stats
  });

  const discoveryTaskId = taskConfig.profileSearchTaskId || taskConfig.postsTaskId;
  const authorDiscoveryRuns: Array<{ query: string; items: unknown[] }> = [];

  for (const query of discoveryQueries) {
    const discoveryInput = taskConfig.profileSearchTaskId
      ? buildProfileSearchInput(taskConfig, query)
      : buildPostsInput({
          ...taskConfig,
          keywords: [query]
        });

    const items = await runApifyTask(discoveryTaskId, discoveryInput, {
      token: appConfig.apifyToken,
      timeoutSeconds: appConfig.apifyTimeoutSeconds
    });
    authorDiscoveryRuns.push({ query, items });
    await convex.mutation("runs.updateStatus", {
      id: runId,
      status: "running",
      message: `Collected author candidates for "${query}".`,
      stats
    });
  }

  const authorCandidates = taskConfig.profileSearchTaskId
    ? buildCandidatesFromDiscovery(
        authorDiscoveryRuns.flatMap(({ query, items }) =>
          normalizeAuthorDiscoveryRecords(items, query).map((record) => ({
            ...record,
            discovery_query: query
          }))
        )
      )
    : buildCandidatesFromPosts(normalizePostRecords(authorDiscoveryRuns.flatMap((run) => run.items)));

  stats.authorsDiscovered = authorCandidates.length;

  const scoredAuthors: ScoredAuthorCandidate[] = [];
  for (const author of authorCandidates) {
    scoredAuthors.push(await scoreAuthor(author, appConfig, taskConfig));
    stats.authorsScored = scoredAuthors.length;
    await convex.mutation("runs.updateStatus", {
      id: runId,
      status: "running",
      message: `Scored ${stats.authorsScored}/${stats.authorsDiscovered} authors.`,
      stats
    });
  }

  await convex.mutation("authors.upsertMany", { authors: scoredAuthors });

  const selectedAuthors = topAuthorsForPosts(scoredAuthors, taskConfig);
  stats.authorsSelected = selectedAuthors.length;
  await convex.mutation("runs.updateStatus", {
    id: runId,
    status: "running",
    message: `Fetching posts for ${stats.authorsSelected} selected authors.`,
    stats
  });

  const authorPostItems: unknown[] = [];
  for (const author of selectedAuthors) {
    const authorPosts = await runApifyTask(taskConfig.postsTaskId, buildAuthorPostsInput(taskConfig, author), {
      token: appConfig.apifyToken,
      timeoutSeconds: appConfig.apifyTimeoutSeconds
    });
    authorPostItems.push(...authorPosts);
    stats.authorPostsFetched = authorPostItems.length;
    await convex.mutation("runs.updateStatus", {
      id: runId,
      status: "running",
      message: `Fetched posts for ${author.name}.`,
      stats
    });
  }

  const normalizedAuthorPosts = normalizePostRecords(authorPostItems);
  stats.postsFetched += normalizedAuthorPosts.length;

  const scoredAuthorPosts: StoredPost[] = [];
  for (const post of normalizedAuthorPosts) {
    scoredAuthorPosts.push(await scorePost(post, appConfig, taskConfig));
    stats.postsScored += 1;
    await convex.mutation("runs.updateStatus", {
      id: runId,
      status: "running",
      message: `Scored author posts ${stats.postsScored}/${stats.postsFetched}.`,
      stats
    });
  }

  const authorScoreByCanonicalId = new Map<string, number>();
  for (const author of scoredAuthors) {
    authorScoreByCanonicalId.set(author.canonical_id, author.score.author_score);
  }

  const finalPosts = mergePostsByCanonicalId(
    [...scoredAuthorPosts].map((post) => ({
      ...post,
      authorScore: post.author?.canonical_id ? authorScoreByCanonicalId.get(post.author.canonical_id) ?? post.authorScore : post.authorScore
    }))
  );

  await convex.mutation("posts.upsertMany", { posts: finalPosts });

  const topPosts = topPostsForComments(finalPosts, taskConfig);
  const allCommentItems: unknown[] = [];

  for (const post of topPosts) {
    const commentItems = await runApifyTask(taskConfig.commentsTaskId, buildCommentsInput(taskConfig, post), {
      token: appConfig.apifyToken,
      timeoutSeconds: appConfig.apifyTimeoutSeconds
    });
    allCommentItems.push(...commentItems);
    stats.commentsFetched = allCommentItems.length;
    await convex.mutation("runs.updateStatus", {
      id: runId,
      status: "running",
      message: `Fetched comments for ${post.url}.`,
      stats
    });
  }

  const normalizedComments = normalizeCommentRecords(allCommentItems, finalPosts);
  const scoredComments: StoredComment[] = [];
  for (const comment of normalizedComments) {
    scoredComments.push(await scoreComment(comment, appConfig, taskConfig));
    stats.commentsScored = scoredComments.length;
  }

  await convex.mutation("comments.upsertMany", { comments: scoredComments });

  await convex.mutation("runs.updateStatus", {
    id: runId,
    status: "running",
    message: "Sending Telegram daily digest.",
    stats
  });

  const digestSent = await sendDailyDigest(finalPosts, scoredComments, appConfig);

  await convex.mutation("runs.updateStatus", {
    id: runId,
    status: "completed",
    message: digestSent ? "Pipeline completed. Daily digest sent." : "Pipeline completed. Telegram is not configured.",
    finishedAt: Date.now(),
    stats
  });
};
