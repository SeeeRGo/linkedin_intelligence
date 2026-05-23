import { ApifyClient } from "apify-client";
import type { StoredPost, TaskConfigRecord } from "./types.js";

type ApifyOptions = {
  token: string;
  timeoutSeconds: number;
};

const parseJsonObject = (value: string): Record<string, unknown> => {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Task input JSON must be an object.");
  }
  return parsed as Record<string, unknown>;
};

export const buildPostsInput = (config: TaskConfigRecord): Record<string, unknown> => ({
  search: config.keywords,
  searches: config.keywords,
  queries: config.keywords,
  searchQueries: config.keywords,
  postedLimit: "24h",
  maxItems: config.maxPosts,
  maxPosts: config.maxPosts,
  ...parseJsonObject(config.postsInputJson)
});

export const buildCommentsInput = (config: TaskConfigRecord, post: StoredPost): Record<string, unknown> => ({
  post: post.url,
  url: post.url,
  urls: [post.url],
  posts: [post.url],
  startUrls: [{ url: post.url }],
  maxItems: 50,
  ...parseJsonObject(config.commentsInputJson)
});

export const runApifyTask = async (
  taskId: string,
  input: Record<string, unknown>,
  options: ApifyOptions
): Promise<unknown[]> => {
  if (!options.token) throw new Error("APIFY_TOKEN is not configured.");
  if (!taskId) throw new Error("Apify task ID is empty.");

  const client = new ApifyClient({ token: options.token });
  const run = await client.task(taskId).call(input, {
    waitSecs: options.timeoutSeconds
  });

  if (String(run.status || "") !== "SUCCEEDED") {
    throw new Error(`Apify task ${taskId} finished with status ${String(run.status || "unknown")}.`);
  }

  if (!run.defaultDatasetId) {
    throw new Error(`Apify task ${taskId} did not return a default dataset.`);
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems({
    clean: true
  });

  return Array.isArray(items) ? items : [];
};
