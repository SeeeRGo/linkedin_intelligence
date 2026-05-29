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

const parseTextList = (value: string): string[] =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const listToStartUrls = (values: string[]): Array<{ url: string }> => values.map((url) => ({ url }));

const allowedPostedLimits = new Set(["any", "1h", "24h", "week", "month", "3months", "6months", "year"]);

const normalizePostedLimit = (value: unknown, fallback: string): string => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const aliases: Record<string, string> = {
    "1d": "24h",
    "7d": "week",
    "30d": "month",
    "90d": "3months",
    "180d": "6months",
    "365d": "year"
  };
  const normalized = aliases[raw] || raw;
  return allowedPostedLimits.has(normalized) ? normalized : fallback;
};

type AuthorLike = {
  name: string;
  url: string;
  role: string;
  type?: string;
};

const defaultDiscoveryKeywords = [
  "fashion retail",
  "luxury retail",
  "merchandising",
  "assortment planning",
  "clienteling",
  "customer experience",
  "returns",
  "fashion tech",
  "retail transformation",
  "inventory strategy",
  "AI in fashion",
  "brand strategy"
];

export const buildPostsInput = (config: TaskConfigRecord): Record<string, unknown> => {
  const keywords = config.keywords.length ? config.keywords : defaultDiscoveryKeywords;
  const overrides = parseJsonObject(config.postsInputJson);
  const input: Record<string, unknown> = {
    query: keywords.join(" "),
    searchQuery: keywords.join(" "),
    search: keywords,
    searches: keywords,
    queryKeywords: keywords,
    queries: keywords,
    searchQueries: keywords,
    keywords,
    maxItems: config.maxPosts,
    maxPosts: config.maxPosts
  };
  Object.assign(input, overrides);
  input.postedLimit = normalizePostedLimit(overrides.postedLimit, "24h");
  return input;
};

export const buildProfileSearchInput = (config: TaskConfigRecord, query: string): Record<string, unknown> => {
  const q = query.trim();
  const baseInput: Record<string, unknown> = {
    searchQuery: q,
    query: q,
    search: q,
    searches: [q],
    profileScraperMode: "Full",
    maximumNumberOfProfilesToScrape: config.profileSearchMaxProfiles,
    maxProfiles: config.profileSearchMaxProfiles,
    maxItems: config.profileSearchMaxProfiles
  };

  return {
    ...baseInput,
    ...parseJsonObject(config.profileSearchInputJson)
  };
};

export const buildAuthorPostsInput = (config: TaskConfigRecord, author: AuthorLike): Record<string, unknown> => {
  const authorUrls = [author.url].filter(Boolean);
  const authorNames = [author.name].filter(Boolean);
  const overrides = parseJsonObject(config.authorPostsInputJson);
  const input: Record<string, unknown> = {
    search: authorNames,
    searches: authorNames,
    queries: authorNames,
    searchQueries: authorNames,
    maxItems: config.authorPostsPerAuthor,
    maxPosts: config.authorPostsPerAuthor
  };
  if (authorUrls.length) {
    Object.assign(input, {
      profileUrls: authorUrls,
      authorUrls,
      startUrls: listToStartUrls(authorUrls),
      urls: authorUrls
    });
  }
  Object.assign(input, overrides);
  input.postedLimit = normalizePostedLimit(overrides.postedLimit, "month");
  return input;
};

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
