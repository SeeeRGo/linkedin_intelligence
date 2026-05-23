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

type TaskConfigSummary = TaskConfig & {
  _id: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

type Run = {
  status: string;
  startedAt?: number;
  message?: string;
  stats?: {
    postsScored?: number;
    postsFetched?: number;
    commentsScored?: number;
    commentsFetched?: number;
  };
};

type Post = {
  canonicalId?: string;
  keyword?: string;
  text?: string;
  url?: string;
  postScore?: number;
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

type Draft = {
  _id?: string;
  name: string;
  openaiModel: string;
  postsTaskId: string;
  commentsTaskId: string;
  maxPosts: string;
  topPostLimit: string;
  minPostScoreForComments: string;
  keywordsText: string;
  postsInputJson: string;
  commentsInputJson: string;
};

const defaultDraft = (): Draft => ({
  name: "",
  openaiModel: "",
  postsTaskId: "",
  commentsTaskId: "",
  maxPosts: "25",
  topPostLimit: "8",
  minPostScoreForComments: "55",
  keywordsText: "",
  postsInputJson: "{}",
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
  postsTaskId: config.postsTaskId || "",
  commentsTaskId: config.commentsTaskId || "",
  maxPosts: String(config.maxPosts ?? 25),
  topPostLimit: String(config.topPostLimit ?? 8),
  minPostScoreForComments: String(config.minPostScoreForComments ?? 55),
  keywordsText: (config.keywords || []).join("\n"),
  postsInputJson: config.postsInputJson || "{}",
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

const commentScoreValue = (comment: Comment): number => comment.commentScore || comment.score?.comment_score || 0;

const App = () => {
  const [health, setHealth] = useState<Health>({});
  const [draft, setDraft] = useState<Draft>(defaultDraft());
  const [configs, setConfigs] = useState<TaskConfigSummary[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [message, setMessage] = useState({ text: "Loading...", tone: "muted" as "muted" | "error" });
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState("Test message from the LinkedIn intelligence React UI.");
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [postFilter, setPostFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState("0");
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
    setDraft(toDraft(config));
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

  const loadPosts = async () => {
    const nextPosts = await responseJson<Post[]>("/api/posts?limit=200");
    setPosts(nextPosts);
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
    setCommentsLoading(true);
    commentsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const nextComments = await responseJson<Comment[]>(
        `/api/comments?parentPostCanonicalId=${encodeURIComponent(post.canonicalId)}&limit=50`
      );
      setComments(nextComments);
      setSelectedComment(nextComments[0] || null);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Failed to load comments.", tone: "error" });
    } finally {
      setCommentsLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.allSettled([loadHealth(), loadConfig(), loadConfigs(), loadRuns(), loadPosts()]);
  };

  useEffect(() => {
    void refreshAll().catch((error) => {
      setMessage({ text: error instanceof Error ? error.message : "Failed to load app data.", tone: "error" });
    });
  }, []);

  const persistConfig = async () => {
    const config = {
      _id: draft._id,
      name: draft.name.trim(),
      openaiModel: draft.openaiModel.trim(),
      postsTaskId: draft.postsTaskId.trim(),
      commentsTaskId: draft.commentsTaskId.trim(),
      maxPosts: parseNumber(draft.maxPosts, 25),
      topPostLimit: parseNumber(draft.topPostLimit, 8),
      minPostScoreForComments: parseNumber(draft.minPostScoreForComments, 55),
      keywords: parseKeywords(draft.keywordsText),
      postsInputJson: draft.postsInputJson || "{}",
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
        body: "{}"
      });
      setMessage({ text: `Run started: ${result.runId}`, tone: "muted" });
      await loadRuns();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Failed to start run.", tone: "error" });
    } finally {
      setIsRunning(false);
    }
  };

  const filteredPosts = useMemo(() => {
    const minScore = Number(scoreFilter);
    const haystack = (post: Post) =>
      [post.keyword, post.text, post.author?.name, post.recommendedAction, ...(post.relevanceTags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return posts
      .filter((post) => (post.postScore || 0) >= minScore)
      .filter((post) => haystack(post).includes(postFilter.trim().toLowerCase()))
      .sort((a, b) => (b.postScore || 0) - (a.postScore || 0));
  }, [posts, postFilter, scoreFilter]);

  const sortedComments = useMemo(() => {
    return [...comments].sort((a, b) => commentScoreValue(b) - commentScoreValue(a));
  }, [comments]);

  const selectedCommentScore = selectedComment?.score;

  const loadSelectedConfig = () => {
    const config = configs.find((entry) => entry._id === selectedConfigId);
    if (!config) {
      setMessage({ text: "Select a saved config first.", tone: "error" });
      return;
    }

    setDraft(toDraft(config));
    setMessage({ text: `Loaded ${config.name}.`, tone: "muted" });
  };

  const createNewConfig = () => {
    setDraft(defaultDraft());
    setSelectedConfigId("");
    setMessage({ text: "New config draft started.", tone: "muted" });
  };

  return (
    <>
      <header className="hero">
        <div>
          <p className="eyebrow">LinkedIn discourse intelligence</p>
          <h1>Apify scoring control panel</h1>
          <p className="lede">Manage Apify task inputs, run OpenAI scoring, and inspect collected posts.</p>
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
              <h2>Task parameters</h2>
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
              Apify posts task ID
              <input
                value={draft.postsTaskId}
                onChange={(event) => setField("postsTaskId", event.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              Apify comments task ID
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
              {isRunning ? "Running..." : "Run collection and scoring"}
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
                <div>{run.message || ""}</div>
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

      <section className="panel posts-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Collected data</p>
            <h2>Posts</h2>
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
            <option value="0">All scores</option>
            <option value="40">Score 40+</option>
            <option value="55">Score 55+</option>
            <option value="70">Score 70+</option>
          </select>
        </div>
        <div className="posts">
          {filteredPosts.map((post, index) => {
            const tags = [...(post.relevanceTags || []), post.recommendedAction].filter(Boolean).join(" / ");

            return (
              <article className="post" key={`${post.url || post.keyword || index}-${index}`}>
                <div className="post-top">
                  <div>
                    <p className="eyebrow">{post.keyword || "unknown keyword"}</p>
                    <h3>{post.author?.name || "Unknown author"}</h3>
                    <div className="meta">{post.author?.role || ""}</div>
                  </div>
                  <span className="score">{post.postScore || 0}</span>
                </div>
                <p className="snippet">
                  {String(post.text || "").slice(0, 520)}
                  {String(post.text || "").length > 520 ? "..." : ""}
                </p>
                <div className="tags">{tags}</div>
                <div className="meta">
                  likes {post.engagement?.likes || 0}, comments {post.engagement?.comments || 0}
                </div>
                <div className="post-actions">
                  <button className="button ghost" onClick={() => void loadComments(post)}>
                    View comments
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
                <p className="meta">No comments available for this post.</p>
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
