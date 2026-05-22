import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

const numberScore = (score: Record<string, unknown> | undefined, field: string): number | undefined => {
  const value = score?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

export const upsertMany = mutation({
  args: {
    posts: v.array(v.any())
  },
  handler: async (ctx, args) => {
    for (const post of args.posts as Record<string, unknown>[]) {
      const score = post.score as Record<string, unknown> | undefined;
      const canonicalId = String(post.canonical_id ?? "");
      if (!canonicalId) continue;

      const payload = {
        canonicalId,
        url: String(post.url ?? ""),
        text: String(post.text ?? ""),
        keyword: String(post.keyword ?? ""),
        postedAt: typeof post.posted_at === "string" ? post.posted_at : undefined,
        author: post.author ?? {},
        engagement: post.engagement ?? {},
        score,
        postScore: numberScore(score, "post_score"),
        authorScore: numberScore(score, "author_score"),
        discussionValue: numberScore(score, "discussion_value"),
        recommendedAction: typeof score?.recommended_action === "string" ? score.recommended_action : undefined,
        relevanceTags: Array.isArray(score?.relevance_tags) ? (score.relevance_tags as string[]) : undefined,
        lowValueFlags: Array.isArray(score?.low_value_flags) ? (score.low_value_flags as string[]) : undefined,
        rawSource: post.raw_source ?? {},
        seenAt: Date.parse(String(post.seen_at ?? "")) || Date.now()
      };

      const existing = await ctx.db
        .query("posts")
        .withIndex("by_canonical", (q) => q.eq("canonicalId", canonicalId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("posts", payload);
      }
    }
  }
});

export const list = query({
  args: {
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_seenAt")
      .order("desc")
      .take(args.limit ?? 100);
  }
});
