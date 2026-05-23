import type { Doc } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

const parentPostCanonicalIdCandidates = (parentPostCanonicalId: string): string[] => {
  const value = parentPostCanonicalId.trim();
  if (!value) return [];

  const candidates = new Set<string>([value]);
  if (!value.startsWith("urn:li:")) {
    candidates.add(`urn:li:activity:${value}`);
    candidates.add(`urn:li:ugcPost:${value}`);
    candidates.add(`urn:li:share:${value}`);
  }

  return [...candidates];
};

export const upsertMany = mutation({
  args: {
    comments: v.array(v.any())
  },
  handler: async (ctx, args) => {
    for (const comment of args.comments as Record<string, unknown>[]) {
      const score = comment.score as Record<string, unknown> | undefined;
      const canonicalId = String(comment.canonical_id ?? "");
      if (!canonicalId) continue;

      const payload = {
        canonicalId,
        parentPostCanonicalId: String(comment.parent_post_canonical_id ?? ""),
        parentPostUrl: String(comment.parent_post_url ?? ""),
        url: String(comment.url ?? ""),
        text: String(comment.text ?? ""),
        keyword: String(comment.keyword ?? ""),
        createdAt: typeof comment.created_at === "string" ? comment.created_at : undefined,
        author: comment.author ?? {},
        engagement: comment.engagement ?? {},
        score,
        commentScore: typeof score?.comment_score === "number" ? score.comment_score : undefined,
        rawSource: comment.raw_source ?? {},
        seenAt: Date.parse(String(comment.seen_at ?? "")) || Date.now()
      };

      const existing = await ctx.db
        .query("comments")
        .withIndex("by_canonical", (q) => q.eq("canonicalId", canonicalId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("comments", payload);
      }
    }
  }
});

export const listByPost = query({
  args: {
    parentPostCanonicalId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const commentsByCanonicalId = new Map<string, Doc<"comments">>();
    for (const candidate of parentPostCanonicalIdCandidates(args.parentPostCanonicalId)) {
      const matches = await ctx.db
        .query("comments")
        .withIndex("by_parent", (q) => q.eq("parentPostCanonicalId", candidate))
        .take(limit);
      for (const comment of matches) {
        commentsByCanonicalId.set(comment.canonicalId, comment);
      }
      if (commentsByCanonicalId.size >= limit) {
        break;
      }
    }

    const comments = [...commentsByCanonicalId.values()].sort(
      (a, b) => (b.commentScore ?? 0) - (a.commentScore ?? 0) || b.seenAt - a.seenAt
    );

    return comments.slice(0, limit);
  }
});

export const listByParentUrl = query({
  args: {
    parentPostUrl: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_parentPostUrl", (q) => q.eq("parentPostUrl", args.parentPostUrl))
      .take(args.limit ?? 50);

    return comments.sort(
      (a, b) => (b.commentScore ?? 0) - (a.commentScore ?? 0) || b.seenAt - a.seenAt
    );
  }
});

export const list = query({
  args: {
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("comments")
      .withIndex("by_seenAt")
      .order("desc")
      .take(args.limit ?? 500);
  }
});
