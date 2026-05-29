import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

const MONTHLY_TOPICS = new Set([
  "merchandising",
  "assortment_planning",
  "retail_transformation",
  "editorial_retail",
  "experiential_retail",
  "luxury_retail",
  "clienteling",
  "customer_decision_making",
  "industry_evolution"
]);

const monthWindow = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    monthLabel: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    start: start.getTime(),
    end: end.getTime()
  };
};

const toTags = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []);

const postEngagement = (post: Record<string, unknown>): number => {
  const engagement = post.engagement && typeof post.engagement === "object" ? (post.engagement as Record<string, unknown>) : {};
  const likes = typeof engagement.likes === "number" ? engagement.likes : 0;
  const comments = typeof engagement.comments === "number" ? engagement.comments : 0;
  const shares = typeof engagement.shares === "number" ? engagement.shares : 0;
  return likes + comments + shares;
};

const isRelevantPost = (post: Record<string, unknown>): boolean => {
  const score = post.score && typeof post.score === "object" ? (post.score as Record<string, unknown>) : {};
  const tags = new Set([...toTags(score.relevance_tags), ...toTags(post.relevanceTags)]);
  const lowValueFlags = new Set([...toTags(score.low_value_flags), ...toTags(post.lowValueFlags)]);
  if (lowValueFlags.has("low_value")) return false;
  return [...tags].some((tag) => MONTHLY_TOPICS.has(tag));
};

const numberValue = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const stringValue = (value: unknown): string => (typeof value === "string" ? value : "");

const numberScore = (score: Record<string, unknown> | undefined, field: string): number | undefined => {
  const value = score?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

export const upsertMany = mutation({
  args: {
    authors: v.array(v.any())
  },
  handler: async (ctx, args) => {
    for (const author of args.authors as Record<string, unknown>[]) {
      const score = author.score as Record<string, unknown> | undefined;
      const canonicalId = String(author.canonical_id ?? "");
      if (!canonicalId) continue;

      const existing = await ctx.db
        .query("authors")
        .withIndex("by_canonical", (q) => q.eq("canonicalId", canonicalId))
        .first();

      const payload = {
        canonicalId,
        url: String(author.url ?? ""),
        name: String(author.name ?? ""),
        role: String(author.role ?? ""),
        type: typeof author.type === "string" ? author.type : undefined,
        score,
        authorScore: numberScore(score, "author_score"),
        authorType: typeof score?.author_type === "string" ? score.author_type : undefined,
        recommendedAction: typeof score?.recommended_action === "string" ? score.recommended_action : undefined,
        relevanceTags: Array.isArray(score?.relevance_tags) ? (score.relevance_tags as string[]) : undefined,
        lowValueFlags: Array.isArray(score?.low_value_flags) ? (score.low_value_flags as string[]) : undefined,
        powerSignals: Array.isArray(score?.power_signals) ? (score.power_signals as string[]) : undefined,
        whyRelevant: typeof score?.why_relevant === "string" ? score.why_relevant : undefined,
        keyThesis: typeof score?.key_thesis === "string" ? score.key_thesis : undefined,
        rationale: typeof score?.rationale === "string" ? score.rationale : undefined,
        confidence: typeof score?.confidence === "number" ? score.confidence : undefined,
        samplePostCount:
          typeof author.sample_post_count === "number" && Number.isFinite(author.sample_post_count)
            ? author.sample_post_count
            : undefined,
        rawSource: author.raw_source ?? {},
        seenAt: Date.parse(String(author.seen_at ?? "")) || Date.now()
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("authors", payload);
      }
    }
  }
});

export const list = query({
  args: {
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const authors = await ctx.db.query("authors").collect();
    const sorted = authors.sort((a, b) => (b.authorScore ?? 0) - (a.authorScore ?? 0) || b.seenAt - a.seenAt);
    return sorted.slice(0, args.limit ?? 100);
  }
});

export const leaderboard = query({
  args: {
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const { monthLabel, start, end } = monthWindow();
    const authors = await ctx.db.query("authors").collect();
    const posts = await ctx.db.query("posts").collect();

    const authorById = new Map(authors.map((author) => [author.canonicalId, author]));
    const groupedPosts = new Map<string, Record<string, unknown>[]>();

    for (const post of posts as Record<string, unknown>[]) {
      const authorCanonicalId = stringValue(post.authorCanonicalId) || stringValue((post.author as Record<string, unknown> | undefined)?.canonical_id);
      if (!authorCanonicalId) continue;
      const postedAt = stringValue(post.postedAt);
      const postedMs = postedAt ? Date.parse(postedAt) : NaN;
      if (!Number.isFinite(postedMs) || postedMs < start || postedMs >= end) continue;

      const existing = groupedPosts.get(authorCanonicalId);
      if (existing) existing.push(post);
      else groupedPosts.set(authorCanonicalId, [post]);
    }

    const rows = [...groupedPosts.entries()].map(([authorCanonicalId, authorPosts]) => {
      const sortedPosts = authorPosts
        .slice()
        .sort((a, b) => numberValue(b.postScore) - numberValue(a.postScore) || stringValue(b.postedAt).localeCompare(stringValue(a.postedAt)));
      const totalPosts = sortedPosts.length;
      const relevantPosts = sortedPosts.filter(isRelevantPost).length;
      const averagePostScore = totalPosts ? sortedPosts.reduce((sum, post) => sum + numberValue(post.postScore), 0) / totalPosts : 0;
      const averageEngagement = totalPosts ? sortedPosts.reduce((sum, post) => sum + postEngagement(post), 0) / totalPosts : 0;
      const maxPostScore = totalPosts ? Math.max(...sortedPosts.map((post) => numberValue(post.postScore))) : 0;
      const lastPostAt = sortedPosts.reduce((latest, post) => {
        const postedAt = stringValue(post.postedAt);
        if (!postedAt) return latest;
        if (!latest) return postedAt;
        return Date.parse(postedAt) > Date.parse(latest) ? postedAt : latest;
      }, "");
      const relevantPostRate = totalPosts ? (relevantPosts / totalPosts) * 100 : 0;
      const activityScore = Math.min(100, totalPosts * 12);
      const engagementScore = Math.min(100, Math.log10(1 + averageEngagement) * 40);
      const leaderboardScore = Math.round(
        relevantPostRate * 0.45 + averagePostScore * 0.35 + engagementScore * 0.15 + activityScore * 0.05
      );
      const author = authorById.get(authorCanonicalId);
      const topPosts = sortedPosts.slice(0, 5);

      return {
        canonicalId: authorCanonicalId,
        month: monthLabel,
        name:
          author?.name ||
          stringValue((sortedPosts[0]?.author as Record<string, unknown> | undefined)?.name) ||
          "Unknown author",
        url:
          author?.url ||
          stringValue((sortedPosts[0]?.author as Record<string, unknown> | undefined)?.url) ||
          stringValue((sortedPosts[0]?.author as Record<string, unknown> | undefined)?.linkedinUrl),
        role:
          author?.role ||
          stringValue((sortedPosts[0]?.author as Record<string, unknown> | undefined)?.role) ||
          stringValue((sortedPosts[0]?.author as Record<string, unknown> | undefined)?.headline),
        type: author?.type,
        authorScore: author?.authorScore,
        authorType: author?.authorType,
        recommendedAction: author?.recommendedAction,
        relevanceTags: author?.relevanceTags || [],
        leaderboardScore,
        leaderboardPostCount: totalPosts,
        leaderboardRelevantPostCount: relevantPosts,
        leaderboardRelevantPostRate: Number(relevantPostRate.toFixed(1)),
        leaderboardAveragePostScore: Number(averagePostScore.toFixed(1)),
        leaderboardAverageEngagement: Number(averageEngagement.toFixed(1)),
        leaderboardMaxPostScore: Number(maxPostScore.toFixed(1)),
        leaderboardLastPostAt: lastPostAt,
        posts: topPosts.map((post) => ({
          canonicalId: post.canonicalId,
          url: post.url,
          text: post.text,
          postedAt: post.postedAt,
          keyword: post.keyword,
          postScore: post.postScore,
          authorScore: post.authorScore,
          engagement: post.engagement,
          recommendedAction: post.recommendedAction,
          relevanceTags: post.relevanceTags,
          author: post.author
        }))
      };
    });

    return rows
      .sort((a, b) => b.leaderboardScore - a.leaderboardScore || b.leaderboardRelevantPostRate - a.leaderboardRelevantPostRate)
      .slice(0, args.limit ?? 50);
  }
});

export const getByCanonicalId = query({
  args: {
    canonicalId: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("authors")
      .withIndex("by_canonical", (q) => q.eq("canonicalId", args.canonicalId))
      .first();
  }
});
