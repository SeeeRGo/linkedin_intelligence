import type { NormalizedAuthor, NormalizedComment, NormalizedPost, StoredPost } from "./types.js";

const stringValue = (value: unknown): string => (typeof value === "string" ? value : "");
const numberValue = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const canonicalizeUrl = (value: string): string => {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.split("?")[0]?.replace(/\/$/, "") ?? value;
  }
};

const authorCanonicalId = (author: Record<string, unknown>): string => {
  const id = stringValue(author.id);
  if (id) return id;

  const url = canonicalizeUrl(stringValue(author.linkedinUrl) || stringValue(author.url));
  if (url) return url;

  const name = stringValue(author.name);
  return name ? name.toLowerCase().replace(/\s+/g, "-") : "";
};

const unwrapApifyItem = (item: unknown): Record<string, unknown> => {
  const record = recordOf(item);
  const data = recordOf(record.data);
  if (data.defaultDatasetId && !data.linkedinUrl && !data.content && !data.commentary) return record;
  return Object.keys(data).length > 0 ? data : record;
};

const normalizeAuthor = (source: unknown): NormalizedAuthor => {
  const author = recordOf(source);
  const canonicalId = authorCanonicalId(author);

  return {
    canonical_id: canonicalId,
    id: stringValue(author.id) || canonicalId,
    name: stringValue(author.name),
    url: canonicalizeUrl(stringValue(author.linkedinUrl) || stringValue(author.url)),
    role: stringValue(author.info) || stringValue(author.position),
    type: stringValue(author.type) || undefined
  };
};

const normalizeEngagement = (source: unknown) => {
  const engagement = recordOf(source);
  return {
    likes: numberValue(engagement.likes),
    comments: numberValue(engagement.comments),
    shares: numberValue(engagement.shares)
  };
};

const canonicalFromUrl = (url: string): string => {
  const activity = url.match(/activity[-:]([0-9]+)/);
  if (activity?.[1]) return activity[1];
  const urn = url.match(/urn:li:[a-zA-Z]+:([0-9]+)/);
  if (urn?.[1]) return urn[1];
  return url;
};

const postCanonicalId = (item: Record<string, unknown>): string => {
  const shareUrn = stringValue(item.shareUrn);
  const entityId = stringValue(item.entityId);
  const id = stringValue(item.id);
  const url = stringValue(item.linkedinUrl) || stringValue(item.shareLinkedinUrl);
  return entityId || id || shareUrn || canonicalFromUrl(url);
};

export const normalizePostRecords = (items: unknown[]): NormalizedPost[] => {
  const seenAt = new Date().toISOString();

  return items
    .map(unwrapApifyItem)
    .filter((item) => {
      const hasPostShape = stringValue(item.type) === "post" || item.content || item.linkedinUrl || item.shareLinkedinUrl;
      return Boolean(hasPostShape && (item.content || item.article || item.job || item.repost));
    })
    .map((item) => {
      const query = recordOf(item.query);
      const postedAt = recordOf(item.postedAt);
      const article = recordOf(item.article);
      const job = recordOf(item.job);
      const repost = recordOf(item.repost);
      const author = normalizeAuthor(item.author);
      const url =
        stringValue(item.linkedinUrl) ||
        stringValue(item.shareLinkedinUrl) ||
        stringValue(recordOf(item.socialContent).shareUrl);
      const text =
        stringValue(item.content) ||
        stringValue(article.description) ||
        stringValue(article.title) ||
        stringValue(job.title) ||
        stringValue(repost.content);

      const post: NormalizedPost = {
        canonical_id: postCanonicalId(item),
        content_type: "post",
        url,
        text,
        keyword: stringValue(query.search),
        posted_at: stringValue(postedAt.date),
        author,
        author_canonical_id: author.canonical_id,
        engagement: normalizeEngagement(item.engagement),
        raw_source: item,
        seen_at: seenAt
      };

      return post;
    })
    .filter((post) => Boolean(post.canonical_id && (post.url || post.text)));
};

export const normalizeCommentRecords = (items: unknown[], parentPosts: StoredPost[] = []): NormalizedComment[] => {
  const seenAt = new Date().toISOString();
  const parentByUrl = new Map(parentPosts.map((post) => [post.url, post]));

  return items
    .map(unwrapApifyItem)
    .filter((item) => Boolean(item.commentary || item.text || item.content || item.linkedinUrl))
    .map((item) => {
      const query = recordOf(item.query);
      const parentUrl = stringValue(query.post) || stringValue(item.parent_post_url);
      const parent = parentByUrl.get(parentUrl);
      const actor = item.actor ?? item.author;
      const postId = stringValue(item.postId) || stringValue(item.parentPostId) || parent?.canonical_id || "";
      const url = stringValue(item.linkedinUrl) || (parentUrl ? `${parentUrl}#comment-${stringValue(item.id)}` : "");
      const parentPostCanonicalId = canonicalFromUrl(postId) || parent?.canonical_id || "";

      const comment: NormalizedComment = {
        canonical_id: stringValue(item.id) || canonicalFromUrl(url),
        content_type: "comment",
        url,
        text: stringValue(item.commentary) || stringValue(item.text) || stringValue(item.content),
        parent_post_canonical_id: parentPostCanonicalId,
        parent_post_url: parentUrl || parent?.url || "",
        keyword: parent?.keyword || "",
        created_at: stringValue(item.createdAt),
        author: normalizeAuthor(actor),
        engagement: normalizeEngagement(item.engagement),
        raw_source: item,
        seen_at: seenAt
      };

      return comment;
    })
    .filter((comment) => Boolean(comment.canonical_id && comment.text));
};
