import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

export const create = mutation({
  args: {
    configId: v.optional(v.string()),
    mode: v.optional(v.string()),
    configSnapshot: v.any(),
    status: v.string(),
    message: v.optional(v.string()),
    startedAt: v.number()
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("runs", {
      configId: args.configId as never,
      mode: args.mode,
      configSnapshot: args.configSnapshot,
      status: args.status,
      message: args.message,
      startedAt: args.startedAt
    });
  }
});

export const updateStatus = mutation({
  args: {
    id: v.string(),
    status: v.string(),
    message: v.optional(v.string()),
    stats: v.optional(v.any()),
    finishedAt: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id as never, {
      status: args.status,
      message: args.message,
      stats: args.stats,
      finishedAt: args.finishedAt
    });
  }
});

export const list = query({
  args: {
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("runs")
      .withIndex("by_startedAt")
      .order("desc")
      .take(args.limit ?? 20);
  }
});
