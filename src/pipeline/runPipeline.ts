import type { AppConfig } from "../config.js";
import { buildAuthorPostsInput, buildCommentsInput, buildPostsInput, buildProfileSearchInput, runApifyTask } from "./apify.js";
import type { ConvexGateway } from "./convex.js";
import { normalizeAuthorDiscoveryRecords, normalizeCommentRecords, normalizePostRecords } from "./normalize.js";
import { failedAuthorScore, failedScore, scoreAuthorRecord, scoreRecord } from "./openai.js";
import { sendDailyDigest } from "./telegram.js";
import type {
  AuthorDiscoveryRecord,
  AuthorScoreResult,
  PipelineMode,
  StoredComment,
  StoredPost,
  TaskConfigRecord
} from "./types.js";

type RunStats = {
  discoveryPostsFetched?: number;
  discoveryPostsScored?: number;
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

const topPostsForComments = (posts: StoredPost[], config: TaskConfigRecord, requireAuthorScore = true): StoredPost[] =>
  posts
    .filter((post) => (requireAuthorScore ? (post.authorScore ?? 0) >= config.authorMinScore : true))
    .filter((post) => (post.score?.post_score ?? 0) >= config.minPostScoreForComments)
    .filter((post) => post.engagement.comments > 0)
    .sort((a, b) => (b.score?.post_score ?? 0) - (a.score?.post_score ?? 0))
    .slice(0, config.topPostLimit);

const discoveryQueriesForConfig = (taskConfig: TaskConfigRecord): string[] => {
  const queries = parseTextList(taskConfig.profileSearchQueriesText);
  return queries.length ? queries : taskConfig.keywords;
};

export const runAuthorFirstPipeline = async (
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

  if (!taskConfig.profileSearchTaskId) {
    throw new Error("Profile search task ID is required for the author-first flow.");
  }

  const discoveryTaskId = taskConfig.profileSearchTaskId;
  const authorDiscoveryRuns: Array<{ query: string; items: unknown[] }> = [];

  for (const query of discoveryQueries) {
    const discoveryInput = buildProfileSearchInput(taskConfig, query);

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

  const authorCandidates = buildCandidatesFromDiscovery(
    authorDiscoveryRuns.flatMap(({ query, items }) =>
      normalizeAuthorDiscoveryRecords(items, query).map((record) => ({
        ...record,
        discovery_query: query
      }))
    )
  );

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

export const runPostFirstPipeline = async (
  runId: string,
  taskConfig: TaskConfigRecord,
  appConfig: AppConfig,
  convex: ConvexGateway
) => {
  const stats: RunStats = {
    profileSearchQueries: 0,
    discoveryPostsFetched: 0,
    discoveryPostsScored: 0,
    authorsDiscovered: 0,
    authorsScored: 0,
    authorsSelected: 0,
    authorPostsFetched: 0,
    postsFetched: 0,
    postsScored: 0,
    commentsFetched: 0,
    commentsScored: 0
  };

  await convex.mutation("runs.updateStatus", {
    id: runId,
    status: "running",
    message: "Fetching discovery posts from Apify.",
    stats
  });

  const discoveryItems = await runApifyTask(taskConfig.postsTaskId, buildPostsInput(taskConfig), {
    token: appConfig.apifyToken,
    timeoutSeconds: appConfig.apifyTimeoutSeconds
  });

  const discoveryPosts = normalizePostRecords(discoveryItems);
  stats.discoveryPostsFetched = discoveryPosts.length;
  stats.postsFetched = discoveryPosts.length;

  const scoredDiscoveryPosts: StoredPost[] = [];
  for (const post of discoveryPosts) {
    scoredDiscoveryPosts.push(await scorePost(post, appConfig, taskConfig));
    stats.discoveryPostsScored = scoredDiscoveryPosts.length;
    stats.postsScored = scoredDiscoveryPosts.length;
    await convex.mutation("runs.updateStatus", {
      id: runId,
      status: "running",
      message: `Scored discovery posts ${stats.postsScored}/${stats.postsFetched}.`,
      stats
    });
  }

  stats.authorsDiscovered = 0;
  stats.authorsScored = 0;
  stats.authorsSelected = 0;
  stats.authorPostsFetched = 0;
  await convex.mutation("runs.updateStatus", {
    id: runId,
    status: "running",
    message: "Filtering discovery posts for comments.",
    stats
  });

  const finalPosts = mergePostsByCanonicalId(scoredDiscoveryPosts);
  await convex.mutation("posts.upsertMany", { posts: finalPosts });

  const topPosts = topPostsForComments(finalPosts, taskConfig, false);
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

export const runScoringPipeline = (
  runId: string,
  taskConfig: TaskConfigRecord,
  appConfig: AppConfig,
  convex: ConvexGateway,
  mode: PipelineMode = "author-first"
) => {
  return mode === "post-first"
    ? runPostFirstPipeline(runId, taskConfig, appConfig, convex)
    : runAuthorFirstPipeline(runId, taskConfig, appConfig, convex);
};
