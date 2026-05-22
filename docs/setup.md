# Setup Guide

## 1. Apify

Create two Apify Actor Tasks:

- a post discovery task that returns public post text, author metadata, post URL, timestamp, and engagement metrics
- a comments task that can harvest comments for the selected top posts

Configure the task with the initial discovery scope, or override it at runtime through `SEARCH_QUERIES_JSON` / `APIFY_SEARCH_QUERIES_JSON` in the n8n environment:

- `assortment planning`
- `fashion merchandising`
- `retail transformation`
- `experiential retail`
- `editorial retail`
- `luxury retail clienteling`
- `customer decision making retail`
- `merchandising blind spots`
- `product customer mismatch`
- the Sabrina Compagno benchmark post URL from `TZ_new.pdf`

The n8n workflow calls the task through:

```text
https://api.apify.com/v2/actor-tasks/{APIFY_TASK_ID}/run-sync-get-dataset-items
```

In the daily workflow, the post task runs first and the comment task runs only for the top-scoring posts. The workflow will use `APIFY_POSTS_TASK_ID` and `APIFY_COMMENTS_TASK_ID` if they are set; `APIFY_TASK_ID` remains a fallback shared value.

## 2. Airtable

Create a base with the four tables described in `airtable/schema.json`:

- `Authors`
- `Posts`
- `Comments`
- `Daily_Digests`

Use the `Canonical ID` field in each table as the merge key. The workflow uses Airtable upsert requests with `performUpsert.fieldsToMergeOn = ["Canonical ID"]`.

If you want the repo to create the tables for you, run `npm run create:airtable-schema` with an Airtable PAT that has `schema.bases:read` and `schema.bases:write` on the target base.

## 3. n8n

Import `n8n/workflows/daily_digest.workflow.json`.
If you want to run discovery in smaller batches to avoid `429 RATE_LIMIT_REACHED`, import `n8n/workflows/rate_limited_search.workflow.json` instead and run it first.
The main digest workflow now batches Airtable writes in groups of up to 10 records and pauses between write requests. If you still see Airtable rate limits, increase `AIRTABLE_BETWEEN_WRITE_MS` in the n8n runtime.
The Telegram digest is keyword-grouped and rendered as `keyword - links - score`, with all posts above the score threshold included up to the per-keyword limit. Comments are fetched for top posts in a second Apify pass and shown in a separate section.
If you want to score one post at a time for debugging or regression checks, import `n8n/workflows/single_post_scoring.workflow.json` and set `TEST_POST_URL` in the n8n runtime. The workflow will send that single LinkedIn link through Apify before scoring it. If your Apify task expects a different body shape, set `APIFY_TEST_INPUT_JSON` to override the request payload.

Set these environment variables in the n8n runtime:

- `APIFY_TOKEN`
- `APIFY_POSTS_TASK_ID`
- `APIFY_COMMENTS_TASK_ID`
- `APIFY_TASK_ID` - fallback shared task ID if you only wired one task initially
- `APIFY_TASK_INPUT_JSON` - optional raw override for the daily Apify task payload
- `OPENAI_API_KEY`
- `OPENAI_SCORING_MODEL`
- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_BETWEEN_WRITE_MS`
- `SEARCH_QUERIES_JSON` - optional JSON array or comma/newline list of discovery keywords
- `APIFY_SEARCH_QUERIES_JSON` - alias for `SEARCH_QUERIES_JSON`
- `TELEGRAM_MIN_SCORE` - minimum overall score for inclusion in the digest
- `TELEGRAM_MAX_LINKS_PER_KEYWORD` - cap on links per keyword line
- `TEST_POST_URL`
- `TEST_POST_JSON` - optional benchmark metadata for expected score comparison
- `APIFY_TEST_INPUT_JSON` - optional raw body override for the Apify task
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Run the workflow manually once before enabling the daily schedule.

## 4. Validation Run

For the first run, configure the Apify task to include only 3-5 known URLs including the benchmark post. Confirm:

- Airtable receives deduplicated authors, posts, comments, and one digest record.
- Telegram receives a readable digest.
- The benchmark post is classified as high-value.
- Generic promotion and shallow trend content score below the digest threshold.

## 5. Compliance Boundary

Use only data that the collector is legally allowed to collect and that your organization is allowed to process. Before production usage, review LinkedIn terms, Apify actor terms, GDPR, CCPA, and any internal data-retention policy.
