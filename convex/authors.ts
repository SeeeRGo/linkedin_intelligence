import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

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
