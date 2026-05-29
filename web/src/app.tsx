import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type Health = {
  ok?: boolean;
  convexConfigured?: boolean;
  apifyConfigured?: boolean;
  openaiConfigured?: boolean;
  telegramConfigured?: boolean;
  telegramChatIdsCount?: number;
  dailyRunConfigured?: boolean;
  dailyRunTime?: string;
  dailyRunTimezone?: string;
};

type TaskConfig = {
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

type TaskConfigSummary = TaskConfig & {
  _id: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

type Run = {
  status: string;
  mode?: string;
  startedAt?: number;
  message?: string;
  stats?: {
    profileSearchQueries?: number;
    authorsDiscovered?: number;
    authorsScored?: number;
    authorsSelected?: number;
    authorPostsFetched?: number;
    postsScored?: number;
    postsFetched?: number;
    commentsScored?: number;
    commentsFetched?: number;
  };
};

type LeaderboardPost = {
  canonicalId?: string;
  keyword?: string;
  text?: string;
  url?: string;
  postedAt?: string;
  postScore?: number;
  authorScore?: number;
  recommendedAction?: string;
  relevanceTags?: string[];
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
  };
  author?: {
    name?: string;
    role?: string;
  };
};

type LeaderboardEntry = {
  canonicalId: string;
  month?: string;
  name: string;
  url?: string;
  role?: string;
  type?: string;
  authorScore?: number;
  authorType?: string;
  recommendedAction?: string;
  relevanceTags?: string[];
  leaderboardScore: number;
  leaderboardPostCount: number;
  leaderboardRelevantPostCount: number;
  leaderboardRelevantPostRate: number;
  leaderboardAveragePostScore: number;
  leaderboardAverageEngagement: number;
  leaderboardMaxPostScore: number;
  leaderboardLastPostAt?: string;
  posts?: LeaderboardPost[];
};

type Post = {
  canonicalId?: string;
  keyword?: string;
  text?: string;
  url?: string;
  postedAt?: string;
  authorCanonicalId?: string;
  postScore?: number;
  authorScore?: number;
  manualScore?: number;
  manualReasoning?: string;
  recommendedAction?: string;
  relevanceTags?: string[];
  engagement?: {
    likes?: number;
    comments?: number;
  };
  author?: {
    name?: string;
    role?: string;
  };
};

type Comment = {
  canonicalId?: string;
  parentPostCanonicalId?: string;
  text?: string;
  createdAt?: string;
  commentScore?: number;
  score?: {
    content_type?: "comment";
    language?: string;
    author_type?: string;
    author_score?: number;
    post_score?: number;
    comment_score?: number;
    discussion_value?: number;
    strategic_interaction_potential?: number;
    recommended_action?: string;
    relevance_tags?: string[];
    low_value_flags?: string[];
    emerging_themes?: string[];
    why_relevant?: string;
    key_thesis?: string;
    rationale?: string;
    confidence?: number;
  };
  author?: {
    name?: string;
    role?: string;
  };
};

type CommentsResponse = {
  comments: Comment[];
  matchSource: "canonical" | "url" | "none";
  parsedCount: number;
  linkedinCommentCount: number;
  parentPostUrl?: string;
};

type Draft = {
  _id?: string;
  name: string;
  openaiModel: string;
  profileSearchTaskId: string;
  profileSearchQueriesText: string;
  profileSearchInputJson: string;
  profileSearchMaxProfiles: string;
  postsTaskId: string;
  commentsTaskId: string;
  maxPosts: string;
  authorTopLimit: string;
  authorMinScore: string;
  authorPostsPerAuthor: string;
  topPostLimit: string;
  minPostScoreForComments: string;
  keywordsText: string;
  postsInputJson: string;
  authorPostsInputJson: string;
  commentsInputJson: string;
};

type ManualPostDraft = {
  score: string;
  reasoning: string;
};

type Author = {
  canonicalId?: string;
  name?: string;
  role?: string;
  url?: string;
  type?: string;
  discoveryQuery?: string;
  authorScore?: number;
  recommendedAction?: string;
  relevanceTags?: string[];
  lowValueFlags?: string[];
  powerSignals?: string[];
  whyRelevant?: string;
  keyThesis?: string;
  rationale?: string;
  confidence?: number;
  samplePostCount?: number;
  score?: {
    author_score?: number;
    recommended_action?: string;
    relevance_tags?: string[];
    low_value_flags?: string[];
    power_signals?: string[];
    why_relevant?: string;
    key_thesis?: string;
    rationale?: string;
    confidence?: number;
  };
};

const defaultDraft = (): Draft => ({
  name: "",
  openaiModel: "",
  profileSearchTaskId: "",
  profileSearchQueriesText: [
    "fashion retail director",
    "luxury retail VP",
    "fashion founder",
    "editor in chief fashion",
    "chief merchandising officer apparel",
    "clienteling luxury retail",
    "retail transformation fashion"
  ].join("\n"),
  profileSearchInputJson: "{}",
  profileSearchMaxProfiles: "20",
  postsTaskId: "",
  commentsTaskId: "",
  maxPosts: "25",
  authorTopLimit: "8",
  authorMinScore: "65",
  authorPostsPerAuthor: "5",
  topPostLimit: "8",
  minPostScoreForComments: "55",
  keywordsText: pageMode === "post-first" ? postFirstKeywordSeed.join("\n") : "",
  postsInputJson: "{}",
  authorPostsInputJson: "{}",
  commentsInputJson: "{}"
});

const responseJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error((body as { error?: string }).error || "Request failed");
  }

  return body as T;
};

const toDraft = (config: TaskConfig): Draft => ({
  _id: config._id,
  name: config.name || "",
  openaiModel: config.openaiModel || "",
  profileSearchTaskId: config.profileSearchTaskId || "",
  profileSearchQueriesText: config.profileSearchQueriesText || "",
  profileSearchInputJson: config.profileSearchInputJson || "{}",
  profileSearchMaxProfiles: String(config.profileSearchMaxProfiles ?? 20),
  postsTaskId: config.postsTaskId || "",
  commentsTaskId: config.commentsTaskId || "",
  maxPosts: String(config.maxPosts ?? 25),
  authorTopLimit: String(config.authorTopLimit ?? 8),
  authorMinScore: String(config.authorMinScore ?? 65),
  authorPostsPerAuthor: String(config.authorPostsPerAuthor ?? 5),
  topPostLimit: String(config.topPostLimit ?? 8),
  minPostScoreForComments: String(config.minPostScoreForComments ?? 55),
  keywordsText: (config.keywords || []).join("\n"),
  postsInputJson: config.postsInputJson || "{}",
  authorPostsInputJson: config.authorPostsInputJson || "{}",
  commentsInputJson: config.commentsInputJson || "{}"
});

const parseKeywords = (value: string): string[] =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatStartedAt = (startedAt?: number): string => (startedAt ? new Date(startedAt).toLocaleString() : "");
const formatPostedAt = (postedAt?: string): string => (postedAt ? new Date(postedAt).toLocaleDateString() : "No timestamp");

const commentScoreValue = (comment: Comment): number => comment.commentScore || comment.score?.comment_score || 0;
const authorScoreValue = (author: Author): number => author.authorScore ?? author.score?.author_score ?? 0;

const manualScoreValue = (post: Post): string => (post.manualScore === undefined || post.manualScore === null ? "" : String(post.manualScore));
const pageMode = window.location.pathname.startsWith("/leaderboard")
  ? "leaderboard"
  : window.location.pathname.startsWith("/post-first")
    ? "post-first"
    : "author-first";
const postFirstKeywordSeed = [
  "fashion retail",
  "luxury retail",
  "merchandising",
  "assortment planning",
  "clienteling",
  "customer experience",
  "returns",
  "fashion tech",
  "retail transformation",
  "inventory strategy",
  "AI in fashion",
  "brand strategy"
];

const App = () => {
  const [health, setHealth] = useState<Health>({});
  const [draft, setDraft] = useState<Draft>(defaultDraft());
  const [configs, setConfigs] = useState<TaskConfigSummary[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsSummary, setCommentsSummary] = useState<CommentsResponse | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [message, setMessage] = useState({ text: "Loading...", tone: "muted" as "muted" | "error" });
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState("Test message from the LinkedIn intelligence React UI.");
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [manualPostDrafts, setManualPostDrafts] = useState<Record<string, ManualPostDraft>>({});
  const [savingManualPostId, setSavingManualPostId] = useState<string | null>(null);
  const [postFilter, setPostFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState(defaultDraft().minPostScoreForComments);
  const [postedFrom, setPostedFrom] = useState("");
  const [postedTo, setPostedTo] = useState("");
  const [selectedRelevanceTags, setSelectedRelevanceTags] = useState<string[]>([]);
  const [leaderboardSort, setLeaderboardSort] = useState("leaderboardScore");
  const [leaderboardSearch, setLeaderboardSearch] = useState("");
  const commentsPanelRef = useRef<HTMLElement | null>(null);

  const setField = <K extends keyof Draft>(field: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const loadHealth = async () => {
    const nextHealth = await responseJson<Health>("/api/health");
    setHealth(nextHealth);
  };

  const loadConfig = async () => {
    const config = await responseJson<TaskConfig>("/api/config");
    const nextDraft = toDraft(config);
    setDraft(nextDraft);
    setScoreFilter(nextDraft.minPostScoreForComments);
    setSelectedConfigId(config._id || "");
  };

  const loadConfigs = async () => {
    const nextConfigs = await responseJson<TaskConfigSummary[]>("/api/configs");
    setConfigs(nextConfigs);
    setSelectedConfigId((current) => {
      if (current && nextConfigs.some((config) => config._id === current)) return current;
      return nextConfigs.find((config) => config.active)?._id || nextConfigs[0]?._id || "";
    });
    return nextConfigs;
  };

  const loadRuns = async () => {
    const nextRuns = await responseJson<Run[]>("/api/runs");
    setRuns(nextRuns);
  };

  const loadAuthors = async () => {
    const nextAuthors = await responseJson<Author[]>("/api/authors?limit=100");
    setAuthors(nextAuthors);
  };

  const loadPosts = async () => {
    const nextPosts = await responseJson<Post[]>("/api/posts?limit=200");
    setPosts(nextPosts);
  };

  const loadLeaderboard = async () => {
    const nextLeaderboard = await responseJson<LeaderboardEntry[]>("/api/leaderboard?limit=50");
    setLeaderboard(nextLeaderboard);
  };

  const setManualDraft = (postId: string, patch: Partial<ManualPostDraft>) => {
    setManualPostDrafts((current) => ({
      ...current,
      [postId]: {
        score: current[postId]?.score ?? "",
        reasoning: current[postId]?.reasoning ?? "",
        ...patch
      }
    }));
  };

  const getManualDraft = (post: Post): ManualPostDraft => {
    const postId = post.canonicalId || "";
    return (
      manualPostDrafts[postId] || {
        score: manualScoreValue(post),
        reasoning: post.manualReasoning || ""
      }
    );
  };

  const saveManualAnnotation = async (post: Post) => {
    if (!post.canonicalId) {
      setMessage({ text: "This post is missing a canonical ID, so it cannot be annotated.", tone: "error" });
      return;
    }

    const draft = getManualDraft(post);
    const manualScoreText = draft.score.trim();
    if (!manualScoreText) {
      setMessage({ text: "Manual score is required.", tone: "error" });
      return;
    }

    const manualScore = Number(manualScoreText);
    if (!Number.isFinite(manualScore)) {
      setMessage({ text: "Manual score must be a number.", tone: "error" });
      return;
    }

    setSavingManualPostId(post.canonicalId);
    try {
      await responseJson<{ ok: boolean }>("/api/posts/manual-score", {
        method: "POST",
        body: JSON.stringify({
          canonicalId: post.canonicalId,
          manualScore,
          manualReasoning: draft.reasoning.trim()
        })
      });
      setMessage({ text: "Manual annotation saved.", tone: "muted" });
      await loadPosts();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Failed to save manual annotation.", tone: "error" });
    } finally {
      setSavingManualPostId(null);
    }
  };

  const sendTelegramTest = async () => {
    setIsSendingTelegram(true);
    try {
      await responseJson<{ ok: boolean }>("/api/telegram/test", {
        method: "POST",
        body: JSON.stringify({ text: telegramMessage })
      });
      setMessage({ text: "Telegram test message sent.", tone: "muted" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Failed to send Telegram test.", tone: "error" });
    } finally {
      setIsSendingTelegram(false);
    }
  };

  const sendTelegramDigest = async () => {
    setIsSendingDigest(true);
    try {
      const result = await responseJson<{ ok: boolean; sent: boolean }>("/api/telegram/digest", {
        method: "POST",
        body: "{}"
      });
      setMessage({
        text: result.sent ? "Daily digest sent to Telegram." : "Telegram digest skipped because it is not configured.",
        tone: "muted"
      });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Failed to send daily digest.", tone: "error" });
    } finally {
      setIsSendingDigest(false);
    }
  };

  const loadComments = async (post: Post) => {
    if (!post.canonicalId) {
      setMessage({ text: "This post is missing a canonical ID, so comments cannot be loaded.", tone: "error" });
      return;
    }

    setSelectedPost(post);
    setSelectedComment(null);
    setComments([]);
    setCommentsSummary(null);
    setCommentsLoading(true);
    commentsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const response = await responseJson<CommentsResponse>(
        `/api/comments?parentPostCanonicalId=${encodeURIComponent(post.canonicalId)}&limit=50`
      );
      const nextComments = response.comments || [];
      setCommentsSummary(response);
      setComments(nextComments);
      setSelectedComment(nextComments[0] || null);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Failed to load comments.", tone: "error" });
    } finally {
      setCommentsLoading(false);
    }
  };

  const refreshAll = async () => {
    if (pageMode === "leaderboard") {
      await Promise.allSettled([loadHealth(), loadLeaderboard()]);
      return;
    }

    await Promise.allSettled([loadHealth(), loadConfig(), loadConfigs(), loadRuns(), loadAuthors(), loadPosts()]);
  };

  useEffect(() => {
    document.title =
      pageMode === "post-first"
        ? "LinkedIn Intelligence | Post-first"
        : pageMode === "leaderboard"
          ? "LinkedIn Intelligence | Monthly leaderboard"
          : "LinkedIn Intelligence | Author-first";
    void refreshAll().catch((error) => {
      setMessage({ text: error instanceof Error ? error.message : "Failed to load app data.", tone: "error" });
    });
  }, []);

  const persistConfig = async () => {
    const config = {
      _id: draft._id,
      name: draft.name.trim(),
      openaiModel: draft.openaiModel.trim(),
      profileSearchTaskId: draft.profileSearchTaskId.trim(),
      profileSearchQueriesText: draft.profileSearchQueriesText || "",
      profileSearchInputJson: draft.profileSearchInputJson || "{}",
      profileSearchMaxProfiles: parseNumber(draft.profileSearchMaxProfiles, 20),
      postsTaskId: draft.postsTaskId.trim(),
      commentsTaskId: draft.commentsTaskId.trim(),
      maxPosts: parseNumber(draft.maxPosts, 25),
      authorTopLimit: parseNumber(draft.authorTopLimit, 8),
      authorMinScore: parseNumber(draft.authorMinScore, 65),
      authorPostsPerAuthor: parseNumber(draft.authorPostsPerAuthor, 5),
      topPostLimit: parseNumber(draft.topPostLimit, 8),
      minPostScoreForComments: parseNumber(draft.minPostScoreForComments, 55),
      keywords: parseKeywords(draft.keywordsText),
      postsInputJson: draft.postsInputJson || "{}",
      authorPostsInputJson: draft.authorPostsInputJson || "{}",
      commentsInputJson: draft.commentsInputJson || "{}"
    };

    JSON.parse(config.postsInputJson);
    JSON.parse(config.commentsInputJson);

    await responseJson<{ id: string }>("/api/config", {
      method: "POST",
      body: JSON.stringify(config)
    });

    await loadConfig();
    await loadConfigs();
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      await persistConfig();
      setMessage({ text: "Config saved.", tone: "muted" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Failed to save config.", tone: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const runPipeline = async () => {
    setIsRunning(true);
    try {
      await persistConfig();
      setMessage({ text: "Config saved.", tone: "muted" });
      const result = await responseJson<{ runId: string }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ mode: pageMode })
      });
      setMessage({ text: `Run started: ${result.runId}`, tone: "muted" });
      await loadRuns();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Failed to start run.", tone: "error" });
    } finally {
      setIsRunning(false);
    }
  };

  const availableRelevanceTags = useMemo(() => {
    return [...new Set(posts.flatMap((post) => post.relevanceTags || []))].sort((a, b) => a.localeCompare(b));
  }, [posts]);

  const toggleRelevanceTag = (tag: string) => {
    setSelectedRelevanceTags((current) =>
      current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]
    );
  };

  const clearRelevanceTags = () => {
    setSelectedRelevanceTags([]);
  };

  const filteredPosts = useMemo(() => {
    const minScore = Number(scoreFilter);
    const search = postFilter.trim().toLowerCase();
    const fromMs = postedFrom ? new Date(`${postedFrom}T00:00:00`).getTime() : null;
    const toMs = postedTo ? new Date(`${postedTo}T23:59:59.999`).getTime() : null;
    const haystack = (post: Post) =>
      [post.keyword, post.text, post.author?.name, post.recommendedAction, ...(post.relevanceTags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return posts
      .filter((post) => (post.postScore || 0) >= minScore)
      .filter((post) => {
        if (!selectedRelevanceTags.length) return true;
        const tags = post.relevanceTags || [];
        return selectedRelevanceTags.some((tag) => tags.includes(tag));
      })
      .filter((post) => {
        if (!fromMs && !toMs) return true;
        if (!post.postedAt) return false;
        const postedMs = new Date(post.postedAt).getTime();
        if (!Number.isFinite(postedMs)) return false;
        if (fromMs !== null && postedMs < fromMs) return false;
        if (toMs !== null && postedMs > toMs) return false;
        return true;
      })
      .filter((post) => haystack(post).includes(search))
      .sort((a, b) => (b.postScore || 0) - (a.postScore || 0));
  }, [posts, postFilter, scoreFilter, postedFrom, postedTo, selectedRelevanceTags]);

  const sortedComments = useMemo(() => {
    return [...comments].sort((a, b) => commentScoreValue(b) - commentScoreValue(a));
  }, [comments]);

  const sortedAuthors = useMemo(() => {
    return [...authors].sort((a, b) => authorScoreValue(b) - authorScoreValue(a));
  }, [authors]);

  const selectedCommentScore = selectedComment?.score;
  const sortedLeaderboard = useMemo(() => {
    const search = leaderboardSearch.trim().toLowerCase();
    const filtered = leaderboard.filter((entry) => {
      if (!search) return true;
      return [entry.name, entry.role, entry.url, ...(entry.relevanceTags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const comparator = (a: LeaderboardEntry, b: LeaderboardEntry) => {
      if (leaderboardSort === "relevanceRate") return b.leaderboardRelevantPostRate - a.leaderboardRelevantPostRate;
      if (leaderboardSort === "averageScore") return b.leaderboardAveragePostScore - a.leaderboardAveragePostScore;
      if (leaderboardSort === "engagement") return b.leaderboardAverageEngagement - a.leaderboardAverageEngagement;
      if (leaderboardSort === "activity") return b.leaderboardPostCount - a.leaderboardPostCount;
      if (leaderboardSort === "recent") {
        const aTime = a.leaderboardLastPostAt ? Date.parse(a.leaderboardLastPostAt) : 0;
        const bTime = b.leaderboardLastPostAt ? Date.parse(b.leaderboardLastPostAt) : 0;
        return bTime - aTime;
      }
      return b.leaderboardScore - a.leaderboardScore;
    };

    return filtered.slice().sort(comparator);
  }, [leaderboard, leaderboardSearch, leaderboardSort]);

  const leaderboardSummary = useMemo(() => {
    const totalPosts = sortedLeaderboard.reduce((sum, entry) => sum + (entry.leaderboardPostCount || 0), 0);
    const relevantPosts = sortedLeaderboard.reduce((sum, entry) => sum + (entry.leaderboardRelevantPostCount || 0), 0);
    const relevantRate = totalPosts ? (relevantPosts / totalPosts) * 100 : 0;
    return {
      authors: sortedLeaderboard.length,
      posts: totalPosts,
      relevantRate: Number(relevantRate.toFixed(1))
    };
  }, [sortedLeaderboard]);

  const loadSelectedConfig = () => {
    const config = configs.find((entry) => entry._id === selectedConfigId);
    if (!config) {
      setMessage({ text: "Select a saved config first.", tone: "error" });
      return;
    }

    const nextDraft = toDraft(config);
    setDraft(nextDraft);
    setScoreFilter(nextDraft.minPostScoreForComments);
    setMessage({ text: `Loaded ${config.name}.`, tone: "muted" });
  };

  const createNewConfig = () => {
    const nextDraft = defaultDraft();
    setDraft(nextDraft);
    setScoreFilter(nextDraft.minPostScoreForComments);
    setSelectedConfigId("");
    setMessage({ text: "New config draft started.", tone: "muted" });
  };

  if (pageMode === "leaderboard") {
    return (
      <>
        <header className="hero">
          <div>
            <p className="eyebrow">Monthly leaderboard · {leaderboard[0]?.month || new Date().toISOString().slice(0, 7)}</p>
            <h1>Relevant author gallery</h1>
            <p className="lede">
              Monthly ranking of fashion merchandising, buying, retail, and fashion-tech voices. Marketing, advertising, and
              logistics are excluded unless they directly affect the merchandising or retail decision chain.
            </p>
            <div className="page-links">
              <a className="page-link" href="/">
                Author-first page
              </a>
              <a className="page-link" href="/post-first">
                Post-first page
              </a>
              <a className="page-link active" href="/leaderboard">
                Monthly leaderboard
              </a>
            </div>
          </div>
          <div className="status-card">
            <strong>Leaderboard status</strong>
            <div>Convex: {health.convexConfigured ? "configured" : "missing"}</div>
            <div>Authors: {leaderboardSummary.authors}</div>
            <div>Monthly posts: {leaderboardSummary.posts}</div>
            <div>Relevant rate: {leaderboardSummary.relevantRate}%</div>
          </div>
        </header>

        <main className="leaderboard-layout">
          <section className="panel leaderboard-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Ranking</p>
                <h2>Monthly leadership board</h2>
                <p className="meta">
                  Sorted by relevance, activity, engagement, and post quality. Each card shows the author’s top posts from the
                  current month.
                </p>
              </div>
              <button className="button ghost" onClick={() => void loadLeaderboard()}>
                Refresh leaderboard
              </button>
            </div>

            <div className="leaderboard-controls">
              <input
                value={leaderboardSearch}
                onChange={(event) => setLeaderboardSearch(event.target.value)}
                placeholder="Filter authors by name, role, tag..."
              />
              <select value={leaderboardSort} onChange={(event) => setLeaderboardSort(event.target.value)}>
                <option value="leaderboardScore">Leaderboard score</option>
                <option value="relevanceRate">% relevant posts</option>
                <option value="averageScore">Average post score</option>
                <option value="engagement">Average engagement</option>
                <option value="activity">Monthly activity</option>
                <option value="recent">Most recent activity</option>
              </select>
            </div>

            <div className="leaderboard-summary">
              <div>
                <span className="detail-label">Ranked authors</span>
                <strong>{leaderboardSummary.authors}</strong>
              </div>
              <div>
                <span className="detail-label">Monthly posts</span>
                <strong>{leaderboardSummary.posts}</strong>
              </div>
              <div>
                <span className="detail-label">Relevant post rate</span>
                <strong>{leaderboardSummary.relevantRate}%</strong>
              </div>
            </div>

            <div className="leaderboard-grid">
              {sortedLeaderboard.length ? (
                sortedLeaderboard.map((entry, index) => {
                  const tags = [...(entry.relevanceTags || [])].filter(Boolean).join(" / ");
                  const topPosts = (entry.posts || []).slice(0, 4);

                  return (
                    <article className="leaderboard-card" key={entry.canonicalId}>
                      <div className="leaderboard-card-head">
                        <div className="leaderboard-rank">#{index + 1}</div>
                        <div className="leaderboard-card-title">
                          <p className="eyebrow">{entry.recommendedAction || "candidate"}</p>
                          <h3>{entry.name}</h3>
                          <div className="meta">{entry.role || "No role"}</div>
                        </div>
                        <div className="score leaderboard-score">{entry.leaderboardScore}</div>
                      </div>

                      <div className="leaderboard-stats">
                        <div>
                          <span className="detail-label">% relevant posts</span>
                          <strong>{entry.leaderboardRelevantPostRate}%</strong>
                        </div>
                        <div>
                          <span className="detail-label">Avg post score</span>
                          <strong>{entry.leaderboardAveragePostScore}</strong>
                        </div>
                        <div>
                          <span className="detail-label">Avg engagement</span>
                          <strong>{entry.leaderboardAverageEngagement}</strong>
                        </div>
                        <div>
                          <span className="detail-label">Monthly posts</span>
                          <strong>{entry.leaderboardPostCount}</strong>
                        </div>
                        <div>
                          <span className="detail-label">Relevant posts</span>
                          <strong>{entry.leaderboardRelevantPostCount}</strong>
                        </div>
                        <div>
                          <span className="detail-label">Max post score</span>
                          <strong>{entry.leaderboardMaxPostScore}</strong>
                        </div>
                      </div>

                      <div className="tags">{tags || "No topical tags yet"}</div>

                      <div className="leaderboard-posts">
                        {topPosts.length ? (
                          topPosts.map((post) => (
                            <article className="leaderboard-post" key={post.canonicalId || post.url}>
                              <div className="leaderboard-post-top">
                                <div>
                                  <p className="eyebrow">{post.keyword || "monthly post"}</p>
                                  <div className="meta">{post.postedAt ? new Date(post.postedAt).toLocaleDateString() : "No date"}</div>
                                </div>
                                <span className="score leaderboard-post-score">{post.postScore || 0}</span>
                              </div>
                              <p className="snippet">{String(post.text || "").slice(0, 240)}</p>
                              <div className="meta">
                                likes {post.engagement?.likes || 0}, comments {post.engagement?.comments || 0}, shares{" "}
                                {post.engagement?.shares || 0}
                              </div>
                              <div className="leaderboard-post-actions">
                                {post.url ? (
                                  <a href={post.url} target="_blank" rel="noreferrer">
                                    Open LinkedIn post
                                  </a>
                                ) : null}
                              </div>
                            </article>
                          ))
                        ) : (
                          <p className="meta">No monthly posts captured yet.</p>
                        )}
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="meta">No monthly leaderboard entries yet. Run the pipeline to populate it.</p>
              )}
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="hero">
        <div>
          <p className="eyebrow">
            LinkedIn discourse intelligence · {pageMode === "post-first" ? "Post-first page" : "Author-first page"}
          </p>
          <h1>{pageMode === "post-first" ? "Post-first collection flow" : "Author-first collection flow"}</h1>
          <p className="lede">
            {pageMode === "post-first"
              ? "Start from discovery posts, then score authors, fetch their posts, and keep the author-first scoring model compatible."
              : "Discover fashion authors first, then fetch and score their posts with the author-first pipeline."}
          </p>
          <div className="page-links">
            <a className={`page-link${pageMode === "author-first" ? " active" : ""}`} href="/">
              Author-first page
            </a>
            <a className={`page-link${pageMode === "post-first" ? " active" : ""}`} href="/post-first">
              Post-first page
            </a>
            <a className={`page-link${pageMode === "leaderboard" ? " active" : ""}`} href="/leaderboard">
              Monthly leaderboard
            </a>
          </div>
        </div>
        <div className="status-card">
          <strong>Server health</strong>
          <div>Convex: {health.convexConfigured ? "configured" : "missing"}</div>
          <div>Apify: {health.apifyConfigured ? "configured" : "missing"}</div>
          <div>OpenAI: {health.openaiConfigured ? "configured" : "missing"}</div>
          <div>
            Telegram:{" "}
            {health.telegramConfigured
              ? `configured (${health.telegramChatIdsCount || 0} chat${health.telegramChatIdsCount === 1 ? "" : "s"})`
              : "missing"}
          </div>
          <div>
            Auto-run:{" "}
            {health.dailyRunConfigured ? `daily at ${health.dailyRunTime} ${health.dailyRunTimezone}` : "manual only"}
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Admin</p>
              <h2>{pageMode === "post-first" ? "Legacy task parameters" : "Task parameters"}</h2>
              <p className="meta">
                {pageMode === "post-first"
                  ? "This page runs the older discovery-post flow. Profile-search settings are preserved for compatibility but not used by this run mode."
                  : "This page runs the author-first flow with profile search, author scoring, and post harvesting."}
              </p>
            </div>
            <div className="config-actions">
              <label className="config-picker">
                Saved configs
                <select value={selectedConfigId} onChange={(event) => setSelectedConfigId(event.target.value)}>
                  <option value="">{configs.length ? "Select a saved config" : "No saved configs yet"}</option>
                  {configs.map((config) => (
                    <option key={config._id} value={config._id}>
                      {config.name}{config.active ? " (active)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button ghost" onClick={loadSelectedConfig} disabled={!selectedConfigId}>
                Load
              </button>
              <button className="button ghost" onClick={createNewConfig}>
                New
              </button>
              <button className="button primary" onClick={() => void saveConfig()} disabled={isSaving || isRunning}>
                {isSaving ? "Saving..." : "Save config"}
              </button>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Config name
              <input value={draft.name} onChange={(event) => setField("name", event.target.value)} autoComplete="off" />
            </label>
            <label>
              OpenAI scoring model
              <input
                value={draft.openaiModel}
                onChange={(event) => setField("openaiModel", event.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              Profile search task ID
              <input
                value={draft.profileSearchTaskId}
                onChange={(event) => setField("profileSearchTaskId", event.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              Profile search max profiles
              <input
                value={draft.profileSearchMaxProfiles}
                onChange={(event) => setField("profileSearchMaxProfiles", event.target.value)}
                type="number"
                min="1"
              />
            </label>
            <label>
              Author post task ID
              <input
                value={draft.postsTaskId}
                onChange={(event) => setField("postsTaskId", event.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              Comments task ID
              <input
                value={draft.commentsTaskId}
                onChange={(event) => setField("commentsTaskId", event.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              Max posts
              <input value={draft.maxPosts} onChange={(event) => setField("maxPosts", event.target.value)} type="number" min="1" />
            </label>
            <label>
              Author top limit
              <input
                value={draft.authorTopLimit}
                onChange={(event) => setField("authorTopLimit", event.target.value)}
                type="number"
                min="1"
              />
            </label>
            <label>
              Author min score
              <input
                value={draft.authorMinScore}
                onChange={(event) => setField("authorMinScore", event.target.value)}
                type="number"
                min="0"
                max="100"
              />
            </label>
            <label>
              Posts per author
              <input
                value={draft.authorPostsPerAuthor}
                onChange={(event) => setField("authorPostsPerAuthor", event.target.value)}
                type="number"
                min="1"
              />
            </label>
            <label>
              Top posts for comments
              <input
                value={draft.topPostLimit}
                onChange={(event) => setField("topPostLimit", event.target.value)}
                type="number"
                min="0"
              />
            </label>
            <label>
              Min post score for comments
              <input
                value={draft.minPostScoreForComments}
                onChange={(event) => setField("minPostScoreForComments", event.target.value)}
                type="number"
                min="0"
                max="100"
              />
            </label>
            <label className="wide">
              Profile search queries, one per line
              <textarea
                value={draft.profileSearchQueriesText}
                onChange={(event) => setField("profileSearchQueriesText", event.target.value)}
                rows={6}
              />
            </label>
            <label className="wide">
              Extra profile search Apify input JSON
              <textarea
                value={draft.profileSearchInputJson}
                onChange={(event) => setField("profileSearchInputJson", event.target.value)}
                rows={8}
                spellCheck={false}
              />
            </label>
            <label className="wide">
              Keywords, one per line
              <textarea value={draft.keywordsText} onChange={(event) => setField("keywordsText", event.target.value)} rows={6} />
            </label>
            <label className="wide">
              Extra posts Apify input JSON
              <textarea
                value={draft.postsInputJson}
                onChange={(event) => setField("postsInputJson", event.target.value)}
                rows={8}
                spellCheck={false}
              />
            </label>
            <label className="wide">
              Extra author posts Apify input JSON
              <textarea
                value={draft.authorPostsInputJson}
                onChange={(event) => setField("authorPostsInputJson", event.target.value)}
                rows={8}
                spellCheck={false}
              />
            </label>
            <label className="wide">
              Extra comments Apify input JSON
              <textarea
                value={draft.commentsInputJson}
                onChange={(event) => setField("commentsInputJson", event.target.value)}
                rows={8}
                spellCheck={false}
              />
            </label>
          </div>

          <div className="actions">
            <button className="button accent" onClick={() => void runPipeline()} disabled={isSaving || isRunning}>
              {isRunning
                ? "Running..."
                : pageMode === "post-first"
                  ? "Run post-first pipeline"
                  : "Run author-first pipeline"}
            </button>
            <span className="message" style={{ color: message.tone === "error" ? "var(--red)" : "var(--muted)" }}>
              {message.text}
            </span>
          </div>
        </section>

        <aside className="panel runs-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Executions</p>
              <h2>Recent runs</h2>
            </div>
            <button className="button ghost" onClick={() => void loadRuns()}>
              Refresh
            </button>
          </div>
          <div className="runs">
            {runs.map((run, index) => (
              <article className="run" key={`${run.status}-${run.startedAt || index}`}>
                <strong>{run.status}</strong>
                <div className="meta">{formatStartedAt(run.startedAt)}</div>
                <div className="meta">{run.mode ? `${run.mode} flow` : "flow not recorded"}</div>
                <div>{run.message || ""}</div>
                <div className="meta">
                  profile queries {run.stats?.profileSearchQueries || 0}, authors {run.stats?.authorsScored || 0}/
                  {run.stats?.authorsDiscovered || 0}, selected{" "}
                  {run.stats?.authorsSelected || 0}, author posts {run.stats?.authorPostsFetched || 0}
                </div>
                <div className="meta">
                  posts {run.stats?.postsScored || 0}/{run.stats?.postsFetched || 0}, comments {run.stats?.commentsScored || 0}/
                  {run.stats?.commentsFetched || 0}
                </div>
              </article>
            ))}
            {!runs.length ? <p className="meta">No runs yet.</p> : null}
          </div>
        </aside>
      </main>

      <section className="panel telegram-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Delivery</p>
            <h2>Telegram</h2>
          </div>
          <div className="telegram-actions">
            <button className="button ghost" onClick={() => void sendTelegramTest()} disabled={isSendingTelegram || isSendingDigest}>
              {isSendingTelegram ? "Sending..." : "Send test"}
            </button>
            <button className="button accent" onClick={() => void sendTelegramDigest()} disabled={isSendingTelegram || isSendingDigest}>
              {isSendingDigest ? "Sending digest..." : "Send daily digest"}
            </button>
          </div>
        </div>
        <div className="form-grid telegram-grid">
          <label className="wide">
            Test message
            <textarea
              value={telegramMessage}
              onChange={(event) => setTelegramMessage(event.target.value)}
              rows={4}
              spellCheck={false}
            />
          </label>
        </div>
      </section>

      <section className="panel authors-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{pageMode === "post-first" ? "Ranking" : "Discovery"}</p>
            <h2>{pageMode === "post-first" ? "Authors from posts" : "Authors"}</h2>
          </div>
          <button className="button ghost" onClick={() => void loadAuthors()}>
            Refresh authors
          </button>
        </div>
        <div className="author-summary">
          <div>
            <span className="detail-label">Ranked authors</span>
            <strong>{sortedAuthors.length}</strong>
          </div>
          <div>
            <span className="detail-label">Author threshold</span>
            <strong>{draft.authorMinScore || "65"}</strong>
          </div>
          <div>
            <span className="detail-label">Selected per run</span>
            <strong>{draft.authorTopLimit || "8"}</strong>
          </div>
        </div>
        <div className="authors">
          {sortedAuthors.length ? (
            sortedAuthors.map((author, index) => {
              const tags = [...(author.relevanceTags || []), ...(author.powerSignals || [])].filter(Boolean).join(" / ");
              return (
                <article className="author-card" key={`${author.canonicalId || author.name || index}-${index}`}>
                  <div className="author-card-head">
                    <div>
                      <p className="eyebrow">{author.recommendedAction || "candidate"}</p>
                      <h3>{author.name || "Unknown author"}</h3>
                      <div className="meta">{author.role || ""}</div>
                    </div>
                    <span className="score">{authorScoreValue(author)}</span>
                  </div>
                  <div className="meta">
                    {author.discoveryQuery ? `${author.discoveryQuery} · ` : ""}
                    {author.samplePostCount || 0} sampled posts{author.url ? " · " : ""}
                    {author.url ? (
                      <a href={author.url} target="_blank" rel="noreferrer">
                        Open LinkedIn profile
                      </a>
                    ) : null}
                  </div>
                  <div className="tags">{tags || "No tags yet"}</div>
                  <p className="snippet">{author.whyRelevant || author.rationale || "No reasoning stored."}</p>
                </article>
              );
            })
          ) : (
            <p className="meta">No authors have been scored yet. Run the pipeline to populate the ranked list.</p>
          )}
        </div>
      </section>

      <section className="panel posts-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{pageMode === "post-first" ? "Discovery" : "Collected data"}</p>
            <h2>{pageMode === "post-first" ? "Discovery posts" : "Posts"}</h2>
          </div>
          <button className="button ghost" onClick={() => void loadPosts()}>
            Refresh posts
          </button>
        </div>
        <div className="post-toolbar">
          <input
            value={postFilter}
            onChange={(event) => setPostFilter(event.target.value)}
            placeholder="Filter by keyword, author, text..."
          />
          <select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)}>
            <option value={draft.minPostScoreForComments || "55"}>
              Default score {draft.minPostScoreForComments || "55"}+
            </option>
            <option value="0">All scores</option>
            <option value="40">Score 40+</option>
            <option value="55">Score 55+</option>
            <option value="70">Score 70+</option>
          </select>
          <label>
            Posted from
            <input type="date" value={postedFrom} onChange={(event) => setPostedFrom(event.target.value)} />
          </label>
          <label>
            Posted to
            <input type="date" value={postedTo} onChange={(event) => setPostedTo(event.target.value)} />
          </label>
        </div>
        <div className="tag-filter-row">
          <div className="tag-filter-header">
            <span className="detail-label">Relevance tags</span>
            <p className="meta">
              {selectedRelevanceTags.length
                ? "Showing posts that match any selected tag."
                : "Select one or more tags to narrow the feed."}
            </p>
          </div>
          <div className="tag-filter-chips">
            {availableRelevanceTags.length ? (
              availableRelevanceTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`filter-chip${selectedRelevanceTags.includes(tag) ? " active" : ""}`}
                  onClick={() => toggleRelevanceTag(tag)}
                >
                  {tag}
                </button>
              ))
            ) : (
              <p className="meta">No relevance tags available yet.</p>
            )}
          </div>
          <div className="tag-filter-actions">
            <button className="button ghost" onClick={clearRelevanceTags} disabled={!selectedRelevanceTags.length}>
              Clear tags
            </button>
          </div>
        </div>
        <div className="posts">
          {filteredPosts.map((post, index) => {
            const tags = [...(post.relevanceTags || []), post.recommendedAction].filter(Boolean).join(" / ");
            const manualDraft = getManualDraft(post);

            return (
              <article className="post" key={`${post.url || post.keyword || index}-${index}`}>
                <div className="post-top">
                  <div>
                    <p className="eyebrow">{post.keyword || "unknown keyword"}</p>
                    <h3>{post.author?.name || "Unknown author"}</h3>
                    <div className="meta">{post.author?.role || ""}</div>
                  </div>
                  <div className="score-stack">
                    <div className="score-block">
                      <span className="score-label">AI</span>
                      <span className="score">{post.postScore || 0}</span>
                    </div>
                    <div className="score-block">
                      <span className="score-label">Manual</span>
                      <span className={`score manual-score${post.manualScore === undefined ? " empty" : ""}`}>
                        {post.manualScore === undefined ? "—" : post.manualScore}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="snippet">
                  {String(post.text || "").slice(0, 520)}
                  {String(post.text || "").length > 520 ? "..." : ""}
                </p>
                <div className="tags">{tags}</div>
                <div className="meta">
                  posted {formatPostedAt(post.postedAt)} · author score {post.authorScore || 0} · likes{" "}
                  {post.engagement?.likes || 0}, LinkedIn comments {post.engagement?.comments || 0}
                </div>
                <div className="manual-annotation">
                  <label>
                    Manual score
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={manualDraft.score}
                      onChange={(event) => setManualDraft(post.canonicalId || "", { score: event.target.value })}
                    />
                  </label>
                  <label className="wide">
                    Manual reasoning
                    <textarea
                      rows={4}
                      value={manualDraft.reasoning}
                      onChange={(event) => setManualDraft(post.canonicalId || "", { reasoning: event.target.value })}
                      placeholder="Why did you score this post the way you did?"
                    />
                  </label>
                </div>
                <div className="post-actions">
                  <button className="button ghost" onClick={() => void loadComments(post)}>
                    View comments
                  </button>
                  <button
                    className="button ghost"
                    onClick={() => void saveManualAnnotation(post)}
                    disabled={savingManualPostId === post.canonicalId}
                  >
                    {savingManualPostId === post.canonicalId ? "Saving..." : "Save manual annotation"}
                  </button>
                  <a href={post.url} target="_blank" rel="noreferrer">
                    Open LinkedIn post
                  </a>
                </div>
              </article>
            );
          })}
          {!filteredPosts.length ? <p className="meta">No posts match the current filter.</p> : null}
        </div>

        <div className="comments-panel" ref={commentsPanelRef}>
          {selectedPost ? (
            <article className="comment-shell">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Comments</p>
                  <h2>{selectedPost.author?.name || "Selected post"}</h2>
                  <p className="meta">{selectedPost.keyword || "unclassified"} · {selectedPost.url || ""}</p>
                </div>
                <button className="button ghost" onClick={() => void loadComments(selectedPost)}>
                  Refresh comments
                </button>
              </div>
              <div className="comment-summary">
                <div>
                  <span className="detail-label">LinkedIn comments</span>
                  <strong>{commentsSummary?.linkedinCommentCount ?? selectedPost.engagement?.comments ?? 0}</strong>
                </div>
                <div>
                  <span className="detail-label">Parsed comments</span>
                  <strong>{commentsSummary?.parsedCount ?? comments.length}</strong>
                </div>
                <div>
                  <span className="detail-label">Loaded from</span>
                  <strong>
                    {commentsSummary?.matchSource === "canonical"
                      ? "Canonical ID"
                      : commentsSummary?.matchSource === "url"
                        ? "Post URL fallback"
                        : "No parsed match"}
                  </strong>
                </div>
              </div>
              {commentsLoading ? (
                <p className="meta">Loading comments...</p>
              ) : sortedComments.length ? (
                <>
                  <div className="comment-detail">
                    {selectedComment ? (
                      <>
                        <div className="comment-top">
                          <div>
                            <p className="eyebrow">Scored comment details</p>
                            <h3>{selectedComment.author?.name || "Unknown commenter"}</h3>
                            <div className="meta">
                              {selectedComment.author?.role || "No role"} · {selectedComment.createdAt || "No timestamp"}
                            </div>
                          </div>
                          <span className="score comment-score">{commentScoreValue(selectedComment)}</span>
                        </div>
                        <p className="snippet">{selectedComment.text || ""}</p>
                        <div className="comment-detail-grid">
                          <div>
                            <span className="detail-label">Recommended action</span>
                            <strong>{selectedCommentScore?.recommended_action || "Not set"}</strong>
                          </div>
                          <div>
                            <span className="detail-label">Comment score</span>
                            <strong>{selectedCommentScore?.comment_score ?? 0}</strong>
                          </div>
                          <div>
                            <span className="detail-label">Discussion value</span>
                            <strong>{selectedCommentScore?.discussion_value ?? 0}</strong>
                          </div>
                          <div>
                            <span className="detail-label">Strategic interaction</span>
                            <strong>{selectedCommentScore?.strategic_interaction_potential ?? 0}</strong>
                          </div>
                          <div>
                            <span className="detail-label">Author score</span>
                            <strong>{selectedCommentScore?.author_score ?? 0}</strong>
                          </div>
                          <div>
                            <span className="detail-label">Confidence</span>
                            <strong>{Math.round((selectedCommentScore?.confidence ?? 0) * 100)}%</strong>
                          </div>
                        </div>
                        <div className="comment-detail-group">
                          <span className="detail-label">Relevance tags</span>
                          <div className="tags">
                            {(selectedCommentScore?.relevance_tags || []).length
                              ? selectedCommentScore?.relevance_tags?.join(" / ")
                              : "None"}
                          </div>
                        </div>
                        <div className="comment-detail-group">
                          <span className="detail-label">Low value flags</span>
                          <div className="tags">
                            {(selectedCommentScore?.low_value_flags || []).length
                              ? selectedCommentScore?.low_value_flags?.join(" / ")
                              : "None"}
                          </div>
                        </div>
                        <div className="comment-detail-group">
                          <span className="detail-label">Emerging themes</span>
                          <div className="tags">
                            {(selectedCommentScore?.emerging_themes || []).length
                              ? selectedCommentScore?.emerging_themes?.join(" / ")
                              : "None"}
                          </div>
                        </div>
                        <div className="comment-detail-group">
                          <span className="detail-label">Why relevant</span>
                          <p>{selectedCommentScore?.why_relevant || "No explanation stored."}</p>
                        </div>
                        <div className="comment-detail-group">
                          <span className="detail-label">Key thesis</span>
                          <p>{selectedCommentScore?.key_thesis || "No thesis stored."}</p>
                        </div>
                        <div className="comment-detail-group">
                          <span className="detail-label">Rationale</span>
                          <p>{selectedCommentScore?.rationale || "No rationale stored."}</p>
                        </div>
                      </>
                    ) : (
                      <p className="meta">Select a comment below to inspect the score payload, rationale, and tags.</p>
                    )}
                  </div>
                  <div className="comments">
                    {sortedComments.map((comment, index) => {
                      const score = comment.score;
                      const tags = [score?.recommended_action, ...(score?.relevance_tags || [])].filter(Boolean).join(" / ");
                      const isSelected = selectedComment?.canonicalId === comment.canonicalId;

                      return (
                        <article
                          className={`comment${isSelected ? " active" : ""}`}
                          key={comment.canonicalId || `${index}-${comment.createdAt || ""}`}
                        >
                          <div className="comment-top">
                            <div>
                              <strong>{comment.author?.name || "Unknown commenter"}</strong>
                              <div className="meta">{comment.author?.role || ""}</div>
                            </div>
                            <span className="score comment-score">{commentScoreValue(comment)}</span>
                          </div>
                          <p className="snippet">{comment.text || ""}</p>
                          <div className="meta">
                            {tags || "No score tags"} · {comment.createdAt || "No timestamp"}
                          </div>
                          <div className="comment-actions">
                            <button className="button ghost" onClick={() => setSelectedComment(comment)}>
                              Inspect scoring
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="meta">
                  {commentsSummary?.parsedCount
                    ? "Parsed comments were found but none matched the current view."
                    : `LinkedIn shows ${selectedPost.engagement?.comments || 0} comments, but none are parsed and stored yet.`}
                </p>
              )}
            </article>
          ) : (
            <article className="comment-shell empty">
              <p className="eyebrow">Comments</p>
              <h2>Select a post to inspect its comments.</h2>
              <p className="meta">Click “View comments” on any post to load the conversation thread from Convex.</p>
            </article>
          )}
        </div>
      </section>
    </>
  );
};

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
