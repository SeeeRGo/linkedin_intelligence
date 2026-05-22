# LinkedIn Discourse Intelligence MVP

This workspace implements the MVP described in `TZ_new.pdf`: a daily LinkedIn discourse monitoring pipeline for fashion merchandising, retail transformation, customer decision-making, experiential retail, and luxury retail.

The implementation is intentionally third-party-component first:

- Apify Actor Tasks collect public LinkedIn posts and comments.
- n8n orchestrates the daily workflow.
- OpenAI Responses API scores each candidate with strict structured output.
- Airtable stores authors, posts, comments, and daily digest records.
- Airtable writes are batched and throttled to stay within API rate limits.
- Telegram receives the daily digest grouped by keyword as `keyword - links - score`.
- A lightweight TypeScript Node.js web app can run the same Apify/OpenAI scoring flow into Convex.

No automated posting, spam engagement, or mass outreach is implemented.

## Files

- `n8n/workflows/daily_digest.workflow.json` - importable n8n workflow.
- `n8n/workflows/rate_limited_search.workflow.json` - sequential Apify search workflow with per-query delay.
- `n8n/workflows/single_post_scoring.workflow.json` - single-post scoring test workflow that scrapes one LinkedIn URL through Apify before scoring.
- `schemas/openai/discourse_score.schema.json` - strict OpenAI scoring schema.
- `prompts/scoring_system.md` - system prompt used by the scoring workflow.
- `airtable/schema.json` - Airtable table and field specification.
- `n8n/fixtures/benchmark_input.json` - Sabrina Compagno benchmark fixture.
- `docs/setup.md` - end-to-end setup instructions.
- `docs/component-notes.md` - integration notes and source links.
- `src/` - TypeScript Node.js API server and Apify/OpenAI scoring pipeline.
- `convex/` - Convex schema and database functions for task configs, runs, posts, and comments.
- `web/src/` - React source for the local admin UI.
- `web/public/` - bundled frontend assets for Apify input management and collected-post browsing.

## Setup

1. Create two Apify Actor Tasks:
   - one for post discovery, used by `APIFY_POSTS_TASK_ID`
   - one for comment harvesting on the top posts, used by `APIFY_COMMENTS_TASK_ID`
2. Create the Airtable base using `airtable/schema.json`, or run `npm run create:airtable-schema` with a PAT that has `schema.bases:read` and `schema.bases:write`.
3. Copy `.env.example` to `.env` in the environment where n8n runs and fill in credentials. The Node app also reads `.env.local`, with `.env.local` taking precedence when both exist. Set `SEARCH_QUERIES_JSON` or `APIFY_SEARCH_QUERIES_JSON` to override the discovery keywords. Use a JSON array or a comma/newline-separated list.
4. Import `n8n/workflows/daily_digest.workflow.json` into n8n for the full scoring/digest pipeline.
5. Import `n8n/workflows/rate_limited_search.workflow.json` if you want a safer query runner for Apify search tasks.
6. Import `n8n/workflows/single_post_scoring.workflow.json` if you want to test one LinkedIn post at a time with the same scoring schema. Set `TEST_POST_URL` to point it at a different post.
7. Configure n8n environment variables, then run the workflow manually once.
8. Verify Airtable records and Telegram digest output before enabling the daily schedule.

## Web App Setup

The web app is a React-based local admin UI for configuring Apify task inputs, launching collection/scoring, and browsing posts stored in Convex.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill:
   - `CONVEX_URL`
   - `APIFY_TOKEN`
   - `APIFY_POSTS_TASK_ID`
   - `APIFY_COMMENTS_TASK_ID`
   - `OPENAI_API_KEY`
   - `OPENAI_SCORING_MODEL`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - optionally `DAILY_RUN_TIME` and `DAILY_RUN_TIMEZONE` to enable automatic daily runs
   The app also accepts `.env`, but `.env.local` is the preferred local override file.
3. Start Convex codegen/dev in one terminal:
   ```bash
   npm run convex:dev
   ```
4. Start the Node.js web server in another terminal:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000`.

If you edit the frontend, rebuild the bundle with:

```bash
npm run build:web
```

The React UI includes a Telegram test-send panel so you can verify the bot token and chat ID from the browser.
After a successful run, the app automatically sends the daily digest to Telegram when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are configured.
The same Telegram panel also has a manual `Send daily digest` button that sends the current stored posts/comments digest on demand.
If `DAILY_RUN_TIME` is set, the server checks once per minute and starts the pipeline automatically after that local time each day, unless a run already happened that day or one is already in progress.

The web pipeline uses two Apify tasks:

- posts task: discovers LinkedIn posts by keywords and stores normalized post records.
- comments task: runs only for top posts above `minPostScoreForComments` and with comments available.

The admin form supports extra raw JSON for both Apify tasks. Those JSON objects are merged after the defaults, so task-specific fields can override `search`, `queries`, `urls`, `startUrls`, or limits if an actor expects a different input shape.

## Acceptance Checks

- The benchmark fixture scores as high value.
- Low-value promotional or trend-only content is excluded from the Telegram digest.
- Airtable deduplicates records by canonical IDs.
- Telegram output includes keyword-grouped relevant posts with scores and emerging themes.
- The web app can save an active Convex task config, start a run, and display collected posts with `keyword`, `url`, and `postScore`.
