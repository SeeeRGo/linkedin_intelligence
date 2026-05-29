import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  taskConfigs: defineTable({
    active: v.boolean(),
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
    commentsInputJson: v.string(),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_active", ["active"]),

  runs: defineTable({
    configId: v.optional(v.id("taskConfigs")),
    mode: v.optional(v.string()),
    configSnapshot: v.any(),
    status: v.string(),
    message: v.optional(v.string()),
    stats: v.optional(v.any()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number())
  }).index("by_startedAt", ["startedAt"]),

  authors: defineTable({
    canonicalId: v.string(),
    url: v.string(),
    name: v.string(),
    role: v.string(),
    type: v.optional(v.string()),
    score: v.optional(v.any()),
    authorScore: v.optional(v.number()),
    authorType: v.optional(v.string()),
    recommendedAction: v.optional(v.string()),
    relevanceTags: v.optional(v.array(v.string())),
    lowValueFlags: v.optional(v.array(v.string())),
    powerSignals: v.optional(v.array(v.string())),
    whyRelevant: v.optional(v.string()),
    keyThesis: v.optional(v.string()),
    rationale: v.optional(v.string()),
    confidence: v.optional(v.number()),
    samplePostCount: v.optional(v.number()),
    rawSource: v.any(),
    seenAt: v.number()
  })
    .index("by_canonical", ["canonicalId"])
    .index("by_seenAt", ["seenAt"])
    .index("by_authorScore", ["authorScore"]),

  posts: defineTable({
    canonicalId: v.string(),
    url: v.string(),
    text: v.string(),
    translatedText: v.optional(v.string()),
    keyword: v.string(),
    postedAt: v.optional(v.string()),
    authorCanonicalId: v.optional(v.string()),
    author: v.any(),
    engagement: v.any(),
    score: v.optional(v.any()),
    postScore: v.optional(v.number()),
    authorScore: v.optional(v.number()),
    discussionValue: v.optional(v.number()),
    recommendedAction: v.optional(v.string()),
    relevanceTags: v.optional(v.array(v.string())),
    lowValueFlags: v.optional(v.array(v.string())),
    manualScore: v.optional(v.number()),
    manualReasoning: v.optional(v.string()),
    manualScoreUpdatedAt: v.optional(v.number()),
    rawSource: v.any(),
    seenAt: v.number()
  })
    .index("by_canonical", ["canonicalId"])
    .index("by_authorCanonicalId", ["authorCanonicalId"])
    .index("by_seenAt", ["seenAt"])
    .index("by_postScore", ["postScore"]),

  comments: defineTable({
    canonicalId: v.string(),
    parentPostCanonicalId: v.string(),
    parentPostUrl: v.string(),
    url: v.string(),
    text: v.string(),
    translatedText: v.optional(v.string()),
    keyword: v.string(),
    createdAt: v.optional(v.string()),
    author: v.any(),
    engagement: v.any(),
    score: v.optional(v.any()),
    commentScore: v.optional(v.number()),
    rawSource: v.any(),
    seenAt: v.number()
  })
    .index("by_canonical", ["canonicalId"])
    .index("by_parent", ["parentPostCanonicalId"])
    .index("by_parentPostUrl", ["parentPostUrl"])
    .index("by_seenAt", ["seenAt"])
});
