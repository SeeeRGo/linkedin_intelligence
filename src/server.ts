import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { defaultTaskConfig, loadAppConfig } from "./config.js";
import { ConvexGateway } from "./pipeline/convex.js";
import { runScoringPipeline } from "./pipeline/runPipeline.js";
import { formatDailyRunSchedule, shouldTriggerDailyRun, type RunSummary } from "./pipeline/scheduler.js";
import { sendDailyDigest, sendTelegramMessage } from "./pipeline/telegram.js";
import type { StoredComment, StoredPost, TaskConfigRecord } from "./pipeline/types.js";

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
    postsTaskId: typeof record.postsTaskId === "string" ? record.postsTaskId.trim() : defaults.postsTaskId,
    commentsTaskId: typeof record.commentsTaskId === "string" ? record.commentsTaskId.trim() : defaults.commentsTaskId,
    keywords,
    maxPosts: Number(record.maxPosts) || defaults.maxPosts,
    topPostLimit: Number(record.topPostLimit) || defaults.topPostLimit,
    minPostScoreForComments: Number(record.minPostScoreForComments) || defaults.minPostScoreForComments,
    openaiModel: typeof record.openaiModel === "string" && record.openaiModel.trim() ? record.openaiModel.trim() : defaults.openaiModel,
    postsInputJson: typeof record.postsInputJson === "string" ? record.postsInputJson : defaults.postsInputJson,
    commentsInputJson: typeof record.commentsInputJson === "string" ? record.commentsInputJson : defaults.commentsInputJson
  };
};

const getActiveConfig = async (): Promise<TaskConfigRecord> => {
  const config = await convex.query<TaskConfigRecord | null>("taskConfigs.getActive");
  return config ?? defaultTaskConfig();
};

const getRecentRuns = async (): Promise<RunSummary[]> => convex.query<RunSummary[]>("runs.list", { limit: 20 });

const schedulePipelineExecution = (runId: string, config: TaskConfigRecord) => {
  setTimeout(() => {
    runScoringPipeline(runId, config, appConfig, convex).catch((error) => {
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

const startPipelineRun = async (triggeredBy: "manual" | "scheduled"): Promise<string> => {
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
      configSnapshot: config,
      status: "queued",
      message: triggeredBy === "scheduled" ? "Daily run queued." : "Run queued.",
      startedAt: Date.now()
    });

    schedulePipelineExecution(runId, config);
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
    const runId = await startPipelineRun("manual");
    sendJson(res, 202, { runId });
    return;
  }

  if (url.pathname === "/api/posts" && req.method === "GET") {
    sendJson(res, 200, await convex.query("posts.list", { limit: Number(url.searchParams.get("limit")) || 100 }));
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
    const posts: StoredPost[] = await convex.query("posts.list", {
      limit: Number(url.searchParams.get("postsLimit")) || 200
    });
    const comments: StoredComment[] = await convex.query("comments.list", {
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

    sendJson(
      res,
      200,
      await convex.query("comments.listByPost", {
        parentPostCanonicalId,
        limit: Number(url.searchParams.get("limit")) || 50
      })
    );
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
