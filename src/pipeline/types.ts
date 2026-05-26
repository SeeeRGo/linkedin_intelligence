export type ScoreResult = {
  canonical_id: string;
  content_type: "post" | "comment" | "post_with_comments";
  language: string;
  author_type: string;
  author_score: number;
  post_score: number;
  comment_score: number;
  discussion_value: number;
  strategic_interaction_potential: number;
  recommended_action: string;
  relevance_tags: string[];
  low_value_flags: string[];
  emerging_themes: string[];
  why_relevant: string;
  key_thesis: string;
  rationale: string;
  confidence: number;
};

export type AuthorScoreResult = {
  canonical_id: string;
  content_type: "author";
  language: string;
  author_type: string;
  author_score: number;
  recommended_action: string;
  relevance_tags: string[];
  low_value_flags: string[];
  power_signals: string[];
  why_relevant: string;
  key_thesis: string;
  rationale: string;
  confidence: number;
};

export type TaskConfigRecord = {
  _id?: string;
  name: string;
  profileSearchTaskId: string;
  profileSearchQueriesText: string;
  profileSearchInputJson: string;
  profileSearchMaxProfiles: number;
  postsTaskId: string;
  commentsTaskId: string;
  keywords: string[];
  maxPosts: number;
  authorTopLimit: number;
  authorMinScore: number;
  authorPostsPerAuthor: number;
  topPostLimit: number;
  minPostScoreForComments: number;
  openaiModel: string;
  postsInputJson: string;
  authorPostsInputJson: string;
  commentsInputJson: string;
};

export type NormalizedAuthor = {
  canonical_id: string;
  id: string;
  name: string;
  url: string;
  role: string;
  type?: string;
};

export type NormalizedPost = {
  canonical_id: string;
  content_type: "post";
  url: string;
  text: string;
  keyword: string;
  posted_at: string;
  author: NormalizedAuthor;
  author_canonical_id: string;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
  raw_source: unknown;
  seen_at: string;
};

export type NormalizedComment = {
  canonical_id: string;
  content_type: "comment";
  url: string;
  text: string;
  parent_post_canonical_id: string;
  parent_post_url: string;
  keyword: string;
  created_at: string;
  author: NormalizedAuthor;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
  raw_source: unknown;
  seen_at: string;
};

export type StoredPost = NormalizedPost & {
  score?: ScoreResult;
  authorScore?: number;
  authorCanonicalId?: string;
  postScore?: number;
  discussionValue?: number;
  recommendedAction?: string;
  relevanceTags?: string[];
  lowValueFlags?: string[];
  manualScore?: number;
  manualReasoning?: string;
  manualScoreUpdatedAt?: number;
};

export type StoredComment = NormalizedComment & {
  score?: ScoreResult;
};

export type StoredAuthor = {
  canonical_id: string;
  name: string;
  url: string;
  role: string;
  type?: string;
  score?: AuthorScoreResult;
  authorScore?: number;
  authorType?: string;
  recommendedAction?: string;
  relevanceTags?: string[];
  lowValueFlags?: string[];
  powerSignals?: string[];
  whyRelevant?: string;
  keyThesis?: string;
  rationale?: string;
  confidence?: number;
  samplePostCount?: number;
  rawSource?: unknown;
  seenAt: number;
};

export type AuthorDiscoveryRecord = {
  canonical_id: string;
  name: string;
  url: string;
  role: string;
  type?: string;
  discovery_query: string;
  raw_source: unknown;
  seen_at: string;
};
