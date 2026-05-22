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

export type TaskConfigRecord = {
  _id?: string;
  name: string;
  postsTaskId: string;
  commentsTaskId: string;
  keywords: string[];
  maxPosts: number;
  topPostLimit: number;
  minPostScoreForComments: number;
  openaiModel: string;
  postsInputJson: string;
  commentsInputJson: string;
};

export type NormalizedAuthor = {
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
};

export type StoredComment = NormalizedComment & {
  score?: ScoreResult;
};
