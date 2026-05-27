# LinkedIn Discourse Intelligence

This workspace is a web-first LinkedIn monitoring system for fashion, luxury, beauty, merchandising, and retail. The supported path is the TypeScript Node.js web app plus Convex storage and scoring.

The pipeline is:

- Apify profile search discovers relevant authors in fashion and retail.
- OpenAI scores authors for authority and discourse value.
- The system fetches recent posts from the top authors.
- OpenAI scores the posts and comments.
- The web app stores and browses authors, posts, and comments in Convex.
- Telegram receives the daily digest when configured.
- The local UI has two routes: `/` for the author-first flow and `/post-first` for the restored post-first flow.

There is no n8n dependency in the supported flow.

## Files

- `prompts/scoring_system.md` - post/comment scoring prompt.
- `prompts/author_scoring_system.md` - author scoring prompt.
- `schemas/openai/discourse_score.schema.json` - post/comment scoring schema.
- `schemas/openai/author_score.schema.json` - author scoring schema.
- `src/` - TypeScript Node.js API server and Apify/OpenAI pipeline.
- `convex/` - Convex schema and database functions.
- `web/src/` - React source for the local admin UI.
- `web/public/` - bundled frontend assets.

## Setup

1. Create three Apify Actor Tasks:
   - one for profile search, used by `APIFY_PROFILE_SEARCH_TASK_ID`
   - one for author post collection, used by `APIFY_POSTS_TASK_ID`
   - one for comments, used by `APIFY_COMMENTS_TASK_ID`
2. Copy `.env.example` to `.env.local` and fill:
   - `CONVEX_URL`
   - `APIFY_TOKEN`
   - `APIFY_PROFILE_SEARCH_TASK_ID`
   - `APIFY_POSTS_TASK_ID`
   - `APIFY_COMMENTS_TASK_ID`
   - `OPENAI_API_KEY`
   - `OPENAI_SCORING_MODEL`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_IDS` or `TELEGRAM_CHAT_ID`
   - optionally `DAILY_RUN_TIME` and `DAILY_RUN_TIMEZONE` for automatic runs
3. Start the app:
   ```bash
   npm install
   npm run convex:dev
   npm run dev
   ```
4. Open `http://localhost:3000`.

If you edit the frontend, rebuild the bundle with:

```bash
npm run build:web
```

## Web App Notes

- The config form includes the profile-search task ID, profile-search queries, and JSON overrides for profile search, author posts, and comments.
- The profile-search step should be tuned for senior fashion and retail decision-makers first, then broader thought leaders.
- The ranked author view shows the profile search query that produced each author, the author score, and the stored rationale.
- The posts view shows author score, post score, and comment access from Convex.
- The post-first page keeps the same data model but starts from discovery posts before scoring authors.

## Acceptance Checks

- Profile search produces a ranked author list.
- Selected authors produce recent posts.
- Posts above threshold trigger comment harvesting.
- The UI can save config, start a run, and browse authors, posts, and comments.
