import type { AppConfig } from "../config.js";
import { runApifyTask, buildCommentsInput, buildPostsInput } from "./apify.js";
import type { ConvexGateway } from "./convex.js";
import { normalizeCommentRecords, normalizePostRecords } from "./normalize.js";
import { failedScore, scoreRecord } from "./openai.js";
import { sendDailyDigest } from "./telegram.js";
import type { StoredComment, StoredPost, TaskConfigRecord } from "./types.js";

type RunStats = {
  postsFetched: number;
  postsScored: number;
  commentsFetched: number;
  commentsScored: number;
};

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

const topPostsForComments = (posts: StoredPost[], config: TaskConfigRecord): StoredPost[] =>
  posts
    .filter((post) => (post.score?.post_score ?? 0) >= config.minPostScoreForComments)
    .filter((post) => post.engagement.comments > 0)
    .sort((a, b) => (b.score?.post_score ?? 0) - (a.score?.post_score ?? 0))
    .slice(0, config.topPostLimit);

export const runScoringPipeline = async (
  runId: string,
  taskConfig: TaskConfigRecord,
  appConfig: AppConfig,
  convex: ConvexGateway
) => {
  const stats: RunStats = { postsFetched: 0, postsScored: 0, commentsFetched: 0, commentsScored: 0 };

  await convex.mutation("runs.updateStatus", {
    id: runId,
    status: "running",
    message: "Fetching posts from Apify.",
    stats
  });

  const postItems = await runApifyTask(taskConfig.postsTaskId, buildPostsInput(taskConfig), {
    token: appConfig.apifyToken,
    timeoutSeconds: appConfig.apifyTimeoutSeconds
  });

  const normalizedPosts = normalizePostRecords(postItems);
  stats.postsFetched = normalizedPosts.length;

  const scoredPosts: StoredPost[] = [];
  for (const post of normalizedPosts) {
    scoredPosts.push(await scorePost(post, appConfig, taskConfig));
    stats.postsScored = scoredPosts.length;
    await convex.mutation("runs.updateStatus", {
      id: runId,
      status: "running",
      message: `Scored ${stats.postsScored}/${stats.postsFetched} posts.`,
      stats
    });
  }

  await convex.mutation("posts.upsertMany", { posts: scoredPosts });

  const topPosts = topPostsForComments(scoredPosts, taskConfig);
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

  const normalizedComments = normalizeCommentRecords(allCommentItems, scoredPosts);
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

  const digestSent = await sendDailyDigest(scoredPosts, scoredComments, appConfig);

  await convex.mutation("runs.updateStatus", {
    id: runId,
    status: "completed",
    message: digestSent ? "Pipeline completed. Daily digest sent." : "Pipeline completed. Telegram is not configured.",
    finishedAt: Date.now(),
    stats
  });
};
