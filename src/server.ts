import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { defaultTaskConfig, loadAppConfig } from "./config.js";
import { buildCommentsInput, runApifyTask } from "./pipeline/apify.js";
import { ConvexGateway } from "./pipeline/convex.js";
import { normalizeCommentRecords } from "./pipeline/normalize.js";
import { failedScore, scoreRecord } from "./pipeline/openai.js";
import { runScoringPipeline } from "./pipeline/runPipeline.js";
import { formatDailyRunSchedule, shouldTriggerDailyRun, type RunSummary } from "./pipeline/scheduler.js";
import { sendDailyDigest, sendTelegramMessage } from "./pipeline/telegram.js";
import type { PipelineMode, StoredAuthor, StoredPost, TaskConfigRecord } from "./pipeline/types.js";

type PostRecord = {
  canonicalId: string;
  url: string;
  text: string;
  keyword: string;
  postedAt?: string;
  authorCanonicalId?: string;
  author: Record<string, unknown>;
  engagement: {
    likes?: number;
    comments?: number;
    shares?: number;
  };
  score?: Record<string, unknown>;
  postScore?: number;
  authorScore?: number;
  discussionValue?: number;
  recommendedAction?: string;
  relevanceTags?: string[];
  lowValueFlags?: string[];
  manualScore?: number;
  manualReasoning?: string;
  manualScoreUpdatedAt?: number;
  rawSource: unknown;
  seenAt: number;
};

type AuthorRecord = StoredAuthor & {
  score?: Record<string, unknown>;
};

type CommentRecord = {
  canonicalId: string;
  parentPostCanonicalId: string;
  parentPostUrl: string;
  url: string;
  text: string;
  keyword: string;
  createdAt?: string;
  author: Record<string, unknown>;
  engagement: {
    likes?: number;
    comments?: number;
    shares?: number;
  };
  score?: {
    comment_score?: number;
    recommended_action?: string;
    relevance_tags?: string[];
  };
  commentScore?: number;
  rawSource: unknown;
  seenAt: number;
};

const appConfig = loadAppConfig();
const convex = new ConvexGateway(appConfig.convexUrl);
const rootDir = process.cwd();
const publicDir = path.join(rootDir, "web", "public");
let pipelineLaunchInFlight = false;

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const readBody = async (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });

const sanitizeConfig = (body: unknown): TaskConfigRecord => {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const defaults = defaultTaskConfig();
  const keywords = Array.isArray(record.keywords)
    ? record.keywords.map(String).map((entry) => entry.trim()).filter(Boolean)
    : defaults.keywords;

  return {
    _id: typeof record._id === "string" ? record._id : undefined,
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : defaults.name,
    profileSearchTaskId:
      typeof record.profileSearchTaskId === "string" ? record.profileSearchTaskId.trim() : defaults.profileSearchTaskId,
    profileSearchQueriesText:
      typeof record.profileSearchQueriesText === "string"
        ? record.profileSearchQueriesText
        : defaults.profileSearchQueriesText,
    profileSearchInputJson:
      typeof record.profileSearchInputJson === "string" ? record.profileSearchInputJson : defaults.profileSearchInputJson,
    profileSearchMaxProfiles: Number(record.profileSearchMaxProfiles) || defaults.profileSearchMaxProfiles,
    postsTaskId: typeof record.postsTaskId === "string" ? record.postsTaskId.trim() : defaults.postsTaskId,
    commentsTaskId: typeof record.commentsTaskId === "string" ? record.commentsTaskId.trim() : defaults.commentsTaskId,
    keywords,
    maxPosts: Number(record.maxPosts) || defaults.maxPosts,
    authorTopLimit: Number(record.authorTopLimit) || defaults.authorTopLimit,
    authorMinScore: Number(record.authorMinScore) || defaults.authorMinScore,
    authorPostsPerAuthor: Number(record.authorPostsPerAuthor) || defaults.authorPostsPerAuthor,
    topPostLimit: Number(record.topPostLimit) || defaults.topPostLimit,
    minPostScoreForComments: Number(record.minPostScoreForComments) || defaults.minPostScoreForComments,
    openaiModel: typeof record.openaiModel === "string" && record.openaiModel.trim() ? record.openaiModel.trim() : defaults.openaiModel,
    postsInputJson: typeof record.postsInputJson === "string" ? record.postsInputJson : defaults.postsInputJson,
    authorPostsInputJson:
      typeof record.authorPostsInputJson === "string" ? record.authorPostsInputJson : defaults.authorPostsInputJson,
    commentsInputJson: typeof record.commentsInputJson === "string" ? record.commentsInputJson : defaults.commentsInputJson
  };
};

const getActiveConfig = async (): Promise<TaskConfigRecord> => {
  const config = await convex.query<TaskConfigRecord | null>("taskConfigs.getActive");
  return { ...defaultTaskConfig(), ...(config ?? {}) };
};

const getPostByCanonicalId = async (canonicalId: string): Promise<PostRecord | null> =>
  convex.query<PostRecord | null>("posts.getByCanonicalId", {
    canonicalId
  });

const mergeCommentLists = (primary: CommentRecord[], secondary: CommentRecord[]): CommentRecord[] => {
  const merged = new Map<string, CommentRecord>();
  for (const comment of [...primary, ...secondary]) {
    merged.set(comment.canonicalId, comment);
  }
  return [...merged.values()].sort(
    (a, b) => (b.commentScore ?? b.score?.comment_score ?? 0) - (a.commentScore ?? a.score?.comment_score ?? 0) || b.seenAt - a.seenAt
  );
};

const getRecentRuns = async (): Promise<RunSummary[]> => convex.query<RunSummary[]>("runs.list", { limit: 20 });

const scoreComment = async (comment: Parameters<typeof scoreRecord>[0] & { canonical_id: string; content_type: "comment" }, taskConfig: TaskConfigRecord) => {
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

const hydrateCommentsForPost = async (post: PostRecord): Promise<number> => {
  if (!appConfig.apifyToken) return 0;

  const taskConfig = await getActiveConfig();
  if (!taskConfig.commentsTaskId || !post.url) return 0;

  const commentItems = await runApifyTask(taskConfig.commentsTaskId, buildCommentsInput(taskConfig, post as unknown as StoredPost), {
    token: appConfig.apifyToken,
    timeoutSeconds: appConfig.apifyTimeoutSeconds
  });

  const normalizedComments = normalizeCommentRecords(commentItems, [post as unknown as StoredPost]);
  if (!normalizedComments.length) return 0;

  const scoredComments = [];
  for (const comment of normalizedComments) {
    scoredComments.push(await scoreComment(comment as Parameters<typeof scoreRecord>[0] & { canonical_id: string; content_type: "comment" }, taskConfig));
  }

  await convex.mutation("comments.upsertMany", { comments: scoredComments });
  return scoredComments.length;
};

const normalizePipelineMode = (value: unknown): PipelineMode =>
  value === "post-first" ? "post-first" : "author-first";

const schedulePipelineExecution = (runId: string, config: TaskConfigRecord, mode: PipelineMode) => {
  setTimeout(() => {
    runScoringPipeline(runId, config, appConfig, convex, mode).catch((error) => {
      convex
        .mutation("runs.updateStatus", {
          id: runId,
          status: "failed",
          message: error instanceof Error ? error.message : "Pipeline failed.",
          finishedAt: Date.now()
        })
        .catch((innerError) => console.error(innerError));
    });
  }, 0);
};

const startPipelineRun = async (triggeredBy: "manual" | "scheduled", mode: PipelineMode = "author-first"): Promise<string> => {
  if (pipelineLaunchInFlight) {
    throw new Error("A run is already starting.");
  }

  pipelineLaunchInFlight = true;
  try {
    if (convex.isConfigured()) {
      const recentRuns = await getRecentRuns();
      if (recentRuns.some((run) => run.status === "queued" || run.status === "running")) {
        throw new Error("A run is already in progress.");
      }
    }

    const config = await getActiveConfig();
    const runId = await convex.mutation<string>("runs.create", {
      configId: config._id,
      mode,
      configSnapshot: config,
      status: "queued",
      message: `${triggeredBy === "scheduled" ? "Daily run" : "Run"} queued (${mode}).`,
      startedAt: Date.now()
    });

    schedulePipelineExecution(runId, config, mode);
    return runId;
  } finally {
    pipelineLaunchInFlight = false;
  }
};

const startDailyScheduler = () => {
  if (!appConfig.dailyRunTime) return;

  const tick = async () => {
    try {
      if (!convex.isConfigured()) return;
      const recentRuns = await getRecentRuns();
      if (!shouldTriggerDailyRun(recentRuns, new Date(), {
        time: appConfig.dailyRunTime,
        timezone: appConfig.dailyRunTimezone
      })) {
        return;
      }

      const runId = await startPipelineRun("scheduled");
      console.log(
        `Daily run started automatically at ${formatDailyRunSchedule({
          time: appConfig.dailyRunTime,
          timezone: appConfig.dailyRunTimezone
        })}: ${runId}`
      );
    } catch (error) {
      console.error(error);
    }
  };

  void tick();
  const interval = setInterval(() => {
    void tick();
  }, 60_000);
  interval.unref?.();
};

const handleApi = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
  if (url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      convexConfigured: convex.isConfigured(),
      apifyConfigured: Boolean(appConfig.apifyToken),
      openaiConfigured: Boolean(appConfig.openaiApiKey),
      telegramConfigured: Boolean(appConfig.telegramBotToken && appConfig.telegramChatIds.length),
      telegramChatIdsCount: appConfig.telegramChatIds.length,
      dailyRunConfigured: Boolean(appConfig.dailyRunTime),
      dailyRunTime: appConfig.dailyRunTime || "",
      dailyRunTimezone: appConfig.dailyRunTimezone
    });
    return;
  }

  if (url.pathname === "/api/config" && req.method === "GET") {
    sendJson(res, 200, await getActiveConfig());
    return;
  }

  if (url.pathname === "/api/configs" && req.method === "GET") {
    sendJson(res, 200, await convex.query("taskConfigs.list"));
    return;
  }

  if (url.pathname === "/api/config" && req.method === "POST") {
    const config = sanitizeConfig(await readBody(req));
    JSON.parse(config.postsInputJson || "{}");
    JSON.parse(config.commentsInputJson || "{}");
    const id = await convex.mutation<string>("taskConfigs.upsert", config);
    sendJson(res, 200, { id });
    return;
  }

  if (url.pathname === "/api/runs" && req.method === "GET") {
    sendJson(res, 200, await convex.query("runs.list", { limit: 20 }));
    return;
  }

  if (url.pathname === "/api/runs" && req.method === "POST") {
    const body = await readBody(req);
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const runId = await startPipelineRun("manual", normalizePipelineMode(record.mode));
    sendJson(res, 202, { runId });
    return;
  }

  if (url.pathname === "/api/posts" && req.method === "GET") {
    sendJson(res, 200, await convex.query("posts.list", { limit: Number(url.searchParams.get("limit")) || 100 }));
    return;
  }

  if (url.pathname === "/api/authors" && req.method === "GET") {
    sendJson(res, 200, await convex.query("authors.list", { limit: Number(url.searchParams.get("limit")) || 100 }));
    return;
  }

  if (url.pathname === "/api/leaderboard" && req.method === "GET") {
    sendJson(res, 200, await convex.query("authors.leaderboard", { limit: Number(url.searchParams.get("limit")) || 50 }));
    return;
  }

  if (url.pathname === "/api/posts/manual-score" && req.method === "POST") {
    const body = await readBody(req);
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const canonicalId = typeof record.canonicalId === "string" ? record.canonicalId.trim() : "";
    if (!canonicalId) {
      sendJson(res, 400, { error: "canonicalId is required." });
      return;
    }

    const post = await getPostByCanonicalId(canonicalId);
    if (!post) {
      sendJson(res, 404, { error: `Post not found: ${canonicalId}` });
      return;
    }

    const manualScore = Number(record.manualScore);
    if (!Number.isFinite(manualScore)) {
      sendJson(res, 400, { error: "manualScore must be a number." });
      return;
    }
    const manualReasoning = typeof record.manualReasoning === "string" ? record.manualReasoning.trim() : "";

    await convex.mutation("posts.updateManualAnnotation", {
      canonicalId: post.canonicalId || canonicalId,
      manualScore,
      manualReasoning
    });

    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/telegram/test" && req.method === "POST") {
    const body = await readBody(req);
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const text = typeof record.text === "string" && record.text.trim()
      ? record.text.trim()
      : "Test message from the LinkedIn intelligence React UI.";

    await sendTelegramMessage(text, {
      botToken: appConfig.telegramBotToken,
      chatIds: appConfig.telegramChatIds
    });

    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/telegram/digest" && req.method === "POST") {
    const posts: PostRecord[] = await convex.query("posts.list", {
      limit: Number(url.searchParams.get("postsLimit")) || 200
    });
    const comments: CommentRecord[] = await convex.query("comments.list", {
      limit: Number(url.searchParams.get("commentsLimit")) || 500
    });
    const sent = await sendDailyDigest(posts, comments, appConfig);
    sendJson(res, 200, { ok: true, sent });
    return;
  }

  if (url.pathname === "/api/comments" && req.method === "GET") {
    const parentPostCanonicalId = url.searchParams.get("parentPostCanonicalId") || "";
    if (!parentPostCanonicalId) {
      sendJson(res, 400, { error: "parentPostCanonicalId is required." });
      return;
    }

    const limit = Number(url.searchParams.get("limit")) || 50;
    const post = await getPostByCanonicalId(parentPostCanonicalId);
    const canonicalComments: CommentRecord[] = await convex.query("comments.listByPost", {
      parentPostCanonicalId,
      limit
    });
    const urlComments: CommentRecord[] = post?.url
      ? await convex.query("comments.listByParentUrl", {
          parentPostUrl: post.url,
          limit
        })
      : [];

    let comments = mergeCommentLists(canonicalComments, urlComments);
    let matchSource: "canonical" | "url" | "none" = canonicalComments.length ? "canonical" : urlComments.length ? "url" : "none";
    if (!comments.length && post?.engagement?.comments && post.engagement.comments > 0) {
      try {
        await hydrateCommentsForPost(post);
        const hydratedCanonicalComments: CommentRecord[] = await convex.query("comments.listByPost", {
          parentPostCanonicalId,
          limit
        });
        const hydratedUrlComments: CommentRecord[] = post?.url
          ? await convex.query("comments.listByParentUrl", {
              parentPostUrl: post.url,
              limit
          })
          : [];
        comments = mergeCommentLists(hydratedCanonicalComments, hydratedUrlComments);
        matchSource = hydratedCanonicalComments.length ? "canonical" : hydratedUrlComments.length ? "url" : matchSource;
      } catch (error) {
        console.error(error);
      }
    }

    sendJson(res, 200, {
      comments,
      matchSource,
      parsedCount: comments.length,
      linkedinCommentCount: post?.engagement?.comments ?? 0,
      parentPostUrl: post?.url ?? ""
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
};

const contentType = (filePath: string): string => {
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
};

const serveStatic = async (res: ServerResponse, pathname: string) => {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 400, { error: "Invalid path" });
    return;
  }

  try {
    await readFile(filePath);
    res.writeHead(200, { "content-type": contentType(filePath) });
    createReadStream(filePath).pipe(res);
  } catch {
    const fallback = path.join(publicDir, "index.html");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    createReadStream(fallback).pipe(res);
  }
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown server error.";
      sendJson(res, 500, { error: message });
    });
    return;
  }

  serveStatic(res, url.pathname).catch((error) => {
    const message = error instanceof Error ? error.message : "Static file error.";
    sendJson(res, 500, { error: message });
  });
}).listen(appConfig.port, () => {
  console.log(`LinkedIn intelligence web app listening on http://localhost:${appConfig.port}`);
  startDailyScheduler();
});
