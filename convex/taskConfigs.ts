import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

const configArgs = {
  _id: v.optional(v.string()),
  name: v.string(),
  profileSearchTaskId: v.string(),
  profileSearchQueriesText: v.string(),
  profileSearchInputJson: v.string(),
  profileSearchMaxProfiles: v.number(),
  postsTaskId: v.string(),
  commentsTaskId: v.string(),
  keywords: v.array(v.string()),
  maxPosts: v.number(),
  authorTopLimit: v.number(),
  authorMinScore: v.number(),
  authorPostsPerAuthor: v.number(),
  topPostLimit: v.number(),
  minPostScoreForComments: v.number(),
  openaiModel: v.string(),
  postsInputJson: v.string(),
  authorPostsInputJson: v.string(),
  commentsInputJson: v.string()
};

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("taskConfigs")
      .withIndex("by_active", (q) => q.eq("active", true))
      .first();
  }
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const configs = await ctx.db.query("taskConfigs").collect();
    return configs.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
    });
  }
});

export const upsert = mutation({
  args: configArgs,
  handler: async (ctx, args) => {
    const now = Date.now();
    const activeConfigs = await ctx.db
      .query("taskConfigs")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    for (const config of activeConfigs) {
      await ctx.db.patch(config._id, { active: false, updatedAt: now });
    }

    if (args._id) {
      const id = args._id as unknown as typeof activeConfigs[number]["_id"];
      await ctx.db.patch(id, {
        active: true,
        name: args.name,
        profileSearchTaskId: args.profileSearchTaskId,
        profileSearchQueriesText: args.profileSearchQueriesText,
        profileSearchInputJson: args.profileSearchInputJson,
        profileSearchMaxProfiles: args.profileSearchMaxProfiles,
        postsTaskId: args.postsTaskId,
        commentsTaskId: args.commentsTaskId,
        keywords: args.keywords,
        maxPosts: args.maxPosts,
        authorTopLimit: args.authorTopLimit,
        authorMinScore: args.authorMinScore,
        authorPostsPerAuthor: args.authorPostsPerAuthor,
        topPostLimit: args.topPostLimit,
        minPostScoreForComments: args.minPostScoreForComments,
        openaiModel: args.openaiModel,
        postsInputJson: args.postsInputJson,
        authorPostsInputJson: args.authorPostsInputJson,
        commentsInputJson: args.commentsInputJson,
        updatedAt: now
      });
      return args._id;
    }

    return await ctx.db.insert("taskConfigs", {
      active: true,
      name: args.name,
      profileSearchTaskId: args.profileSearchTaskId,
      profileSearchQueriesText: args.profileSearchQueriesText,
      profileSearchInputJson: args.profileSearchInputJson,
      profileSearchMaxProfiles: args.profileSearchMaxProfiles,
      postsTaskId: args.postsTaskId,
      commentsTaskId: args.commentsTaskId,
      keywords: args.keywords,
      maxPosts: args.maxPosts,
      authorTopLimit: args.authorTopLimit,
      authorMinScore: args.authorMinScore,
      authorPostsPerAuthor: args.authorPostsPerAuthor,
      topPostLimit: args.topPostLimit,
      minPostScoreForComments: args.minPostScoreForComments,
      openaiModel: args.openaiModel,
      postsInputJson: args.postsInputJson,
      authorPostsInputJson: args.authorPostsInputJson,
      commentsInputJson: args.commentsInputJson,
      createdAt: now,
      updatedAt: now
    });
  }
});
