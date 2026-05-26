import "../env-loader.js";

export type AppConfig = {
  apifyToken: string;
  convexUrl: string;
  dailyRunTime: string;
  dailyRunTimezone: string;
  openaiApiKey: string;
  openaiScoringModel: string;
  telegramBotToken: string;
  telegramChatIds: string[];
  telegramMinScore: number;
  telegramMaxLinksPerKeyword: number;
  telegramMaxCommentHighlights: number;
  apifyTimeoutSeconds: number;
  port: number;
};

const numberFromEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const listFromEnv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const uniqueStrings = (values: string[]): string[] => [...new Set(values)];

const telegramChatIdsFromEnv = (): string[] =>
  uniqueStrings([...listFromEnv(process.env.TELEGRAM_CHAT_IDS), ...listFromEnv(process.env.TELEGRAM_CHAT_ID)]);

export const loadAppConfig = (): AppConfig => ({
  apifyToken: process.env.APIFY_TOKEN ?? "",
  convexUrl: process.env.CONVEX_URL ?? "",
  dailyRunTime: process.env.DAILY_RUN_TIME ?? "",
  dailyRunTimezone: process.env.DAILY_RUN_TIMEZONE ?? "UTC",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiScoringModel: process.env.OPENAI_SCORING_MODEL ?? "gpt-5.4-mini",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatIds: telegramChatIdsFromEnv(),
  telegramMinScore: numberFromEnv("TELEGRAM_MIN_SCORE", 60),
  telegramMaxLinksPerKeyword: numberFromEnv("TELEGRAM_MAX_LINKS_PER_KEYWORD", 5),
  telegramMaxCommentHighlights: numberFromEnv("TELEGRAM_MAX_COMMENT_HIGHLIGHTS", 8),
  apifyTimeoutSeconds: numberFromEnv("APIFY_TIMEOUT_SECONDS", 300),
  port: numberFromEnv("PORT", 3001)
});

export const defaultTaskConfig = () => ({
  name: "Default LinkedIn scoring run",
  postsTaskId: process.env.APIFY_POSTS_TASK_ID ?? process.env.APIFY_TASK_ID ?? "",
  commentsTaskId: process.env.APIFY_COMMENTS_TASK_ID ?? "",
  keywords: [
    "assortment planning",
    "assortment strategy",
    "collection merchandising",
    "customer decision making",
    "retail transformation"
  ],
  authorSeedProfilesText: [
    "https://www.linkedin.com/in/mary-korlin-downs-614b67128/",
    "https://www.linkedin.com/in/melissalim89/",
    "https://www.linkedin.com/in/sabrina-compagno-6a410823/",
    "https://www.linkedin.com/in/kovacspetra/",
    "https://www.linkedin.com/in/renatomosca1/",
    "https://www.linkedin.com/in/francis-pierrel-053b201/",
    "https://www.linkedin.com/in/matteo-atti-uk/",
    "https://www.linkedin.com/in/sandrine-crener/",
    "https://www.linkedin.com/in/nina-skarra-idntfy/"
  ].join("\n"),
  maxPosts: 25,
  authorTopLimit: 8,
  authorMinScore: 65,
  authorPostsPerAuthor: 5,
  topPostLimit: 8,
  minPostScoreForComments: 55,
  openaiModel: process.env.OPENAI_SCORING_MODEL ?? "gpt-5.4-mini",
  postsInputJson: "{}",
  authorPostsInputJson: "{}",
  commentsInputJson: "{}"
});
