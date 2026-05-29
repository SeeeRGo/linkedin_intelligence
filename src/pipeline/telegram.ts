import type { AppConfig } from "../config.js";

type TelegramOptions = {
  botToken: string;
  chatIds: string[];
};

type ScoreLike = {
  post_score?: number;
  comment_score?: number;
  discussion_value?: number;
  strategic_interaction_potential?: number;
  recommended_action?: string;
  emerging_themes?: string[];
};

type DigestAuthorLike = {
  name?: string;
};

type DigestBaseLike = {
  author?: DigestAuthorLike;
  url?: string;
  text?: string;
  translatedText?: string;
  keyword?: string;
  score?: ScoreLike;
  postScore?: number;
  commentScore?: number;
  parent_post_url?: string;
  parentPostUrl?: string;
  recommendedAction?: string;
  relevanceTags?: string[];
  lowValueFlags?: string[];
};

type DigestPostLike = DigestBaseLike & {
};

type DigestCommentLike = DigestBaseLike & {
};

const parseTelegramError = async (response: Response): Promise<string> => {
  const text = await response.text();
  if (!text) return response.statusText;

  try {
    const body = JSON.parse(text) as { description?: string; error_code?: number };
    return body.description || text;
  } catch {
    return text;
  }
};

const sendTelegramMessageToChat = async (text: string, botToken: string, chatId: string): Promise<void> => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: false
    })
  });

  if (!response.ok) {
    const description = await parseTelegramError(response);
    throw new Error(`Telegram request failed for chat ${chatId} (${response.status}): ${description}`);
  }
};

export const sendTelegramMessage = async (text: string, options: TelegramOptions): Promise<void> => {
  if (!options.botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  if (!options.chatIds.length) throw new Error("TELEGRAM_CHAT_ID or TELEGRAM_CHAT_IDS is not configured.");

  const results = await Promise.allSettled(
    options.chatIds.map((chatId) => sendTelegramMessageToChat(text, options.botToken, chatId))
  );
  const failures = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return [`${options.chatIds[index]}: ${reason}`];
  });

  if (failures.length) {
    throw new Error(`Telegram request failed for ${failures.length}/${options.chatIds.length} chats: ${failures.join(" | ")}`);
  }
};

const overallScore = (candidate: DigestPostLike | DigestCommentLike): number => {
  const score = (candidate.score || {}) as ScoreLike;
  return Math.max(
    Number(candidate.postScore || score.post_score || 0),
    Number(candidate.commentScore || score.comment_score || 0),
    Number(score.discussion_value || 0),
    Number(score.strategic_interaction_potential || 0)
  );
};

const displayAuthorName = (candidate: DigestPostLike | DigestCommentLike): string => candidate.author?.name || "Unknown author";
const displayText = (candidate: DigestPostLike | DigestCommentLike): string =>
  candidate.translatedText || candidate.text || "";

const buildKeywordLines = (posts: DigestPostLike[], maxLinksPerKeyword: number, minScore: number): string[] => {
  const relevantPosts = posts.filter((candidate) => overallScore(candidate) >= minScore && candidate.score?.recommended_action !== "ignore");
  const keywordGroups = new Map<string, DigestPostLike[]>();

  for (const candidate of relevantPosts) {
    const keyword = String(candidate.keyword || "unclassified").trim() || "unclassified";
    if (!keywordGroups.has(keyword)) keywordGroups.set(keyword, []);
    keywordGroups.get(keyword)?.push(candidate);
  }

  const keywordEntries = [...keywordGroups.entries()].sort((a, b) => {
    const aMax = Math.max(...a[1].map((candidate) => overallScore(candidate)));
    const bMax = Math.max(...b[1].map((candidate) => overallScore(candidate)));
    if (bMax !== aMax) return bMax - aMax;
    return b[1].length - a[1].length;
  });

  return keywordEntries.map(([keyword, candidates]) => {
    const sortedCandidates = candidates.slice().sort((a, b) => overallScore(b) - overallScore(a)).slice(0, maxLinksPerKeyword);
    const links = sortedCandidates.map((candidate) => {
      const score = overallScore(candidate);
      const label = displayAuthorName(candidate);
      const link = candidate.url ? `${label} (${candidate.url})` : label;
      return `${link} - ${score}/100`;
    });
    return `${keyword} - ${links.join(", ")}`;
  });
};

const buildCommentLines = (comments: DigestCommentLike[], maxCommentHighlights: number, minScore: number): string[] => {
  const relevantComments = comments.filter((candidate) => overallScore(candidate) >= minScore && candidate.score?.recommended_action !== "ignore");

  return relevantComments
    .slice()
    .sort((a, b) => overallScore(b) - overallScore(a))
    .slice(0, maxCommentHighlights)
    .map((candidate) => {
      const score = overallScore(candidate);
      const parentLink = candidate.parent_post_url || candidate.parentPostUrl || candidate.url || "";
      const label = displayAuthorName(candidate);
      const link = parentLink ? `${label} (${parentLink})` : label;
      return `${link} - ${score}/100${displayText(candidate) ? `\n${displayText(candidate).slice(0, 220)}` : ""}`;
    });
};

const buildThemeLines = (posts: DigestPostLike[], comments: DigestCommentLike[], minScore: number): string[] => {
  const themeCounts = new Map<string, number>();
  for (const candidate of [...posts, ...comments]) {
    if (overallScore(candidate) < minScore || candidate.score?.recommended_action === "ignore") continue;
    for (const theme of candidate.score?.emerging_themes || []) {
      const key = String(theme).trim();
      if (!key) continue;
      themeCounts.set(key, (themeCounts.get(key) || 0) + 1);
    }
  }

  return [...themeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([theme]) => theme);
};

export const buildDailyDigestText = (posts: DigestPostLike[], comments: DigestCommentLike[], config: AppConfig): string => {
  const date = new Date().toISOString().slice(0, 10);
  const keywordLines = buildKeywordLines(posts, config.telegramMaxLinksPerKeyword, config.telegramMinScore);
  const commentLines = buildCommentLines(comments, config.telegramMaxCommentHighlights, config.telegramMinScore);
  const themes = buildThemeLines(posts, comments, config.telegramMinScore);

  let text = `Ежедневный дайджест LinkedIn-дискурса\n${date}\n\n`;
  text += `Релевантное по ключевым словам\n`;
  text += keywordLines.length ? keywordLines.join("\n") : "Нет постов, прошедших порог по рейтингу.";
  text += `\n\nЛучшие комментарии\n`;
  text += commentLines.length ? commentLines.join("\n\n") : "Нет комментариев, прошедших порог по рейтингу.";
  text += `\n\nНовые темы\n`;
  text += themes.length ? themes.map((theme) => `- ${theme}`).join("\n") : "Пока нет сильных тем.";

  if (text.length > 3900) {
    text = `${text.slice(0, 3850)}\n\nДайджест обрезан в Telegram; полные записи доступны в приложении.`;
  }

  return text;
};

export const sendDailyDigest = async (posts: DigestPostLike[], comments: DigestCommentLike[], config: AppConfig): Promise<boolean> => {
  if (!config.telegramBotToken || !config.telegramChatIds.length) return false;
  const text = buildDailyDigestText(posts, comments, config);
  await sendTelegramMessage(text, {
    botToken: config.telegramBotToken,
    chatIds: config.telegramChatIds
  });
  return true;
};
