# Setup Guide

## 1. Apify

Create three Apify Actor Tasks:

- a profile search task for author discovery
- an author post collection task
- a comments task

Recommended profile-search tuning for this project:

- Profile Scraper Mode: `Full`
- Search query: one narrow query per run, or one of the saved queries in the web app
- Maximum number of profiles to scrape: `20`
- Current Job Title Filter: `Founder`, `CEO`, `Chief Merchandising Officer`, `VP`, `SVP`, `Director`, `Editor-in-Chief`, `Head of Merchandising`
- Senority Level Filter: `Owner`, `CXO`, `VP`, `Director`
- Function Filter: `Marketing`, `Operations`, `Purchasing`, `Business Development`, `Media`, `Product`
- Industry IDs Filter: use fashion, retail, apparel, luxury, or beauty if the actor supports it

If the actor supports raw JSON overrides, use them for titles, seniority, function, and exclusions instead of hardcoding everything in the UI.

The web app calls the task through the Apify HTTP API using the task ID stored in Convex.

## 2. Convex

The app stores authors, posts, comments, task configs, and runs in Convex.

If you want the repo to generate Convex bindings after schema changes, run:

```bash
npm run convex:dev
```

## 3. Web App

Copy `.env.example` to `.env.local` and set:

- `CONVEX_URL`
- `APIFY_TOKEN`
- `APIFY_PROFILE_SEARCH_TASK_ID`
- `APIFY_POSTS_TASK_ID`
- `APIFY_COMMENTS_TASK_ID`
- `OPENAI_API_KEY`
- `OPENAI_SCORING_MODEL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_IDS` or `TELEGRAM_CHAT_ID`

Then run:

```bash
npm install
npm run convex:dev
npm run dev
```

Open `http://localhost:3000`.

## 4. Validation

For the first run, start with 3-5 profile-search queries and a profile limit of around 20. Confirm:

- the author list is populated and ranked
- the selected authors have relevant posts
- posts and comments are stored in Convex
- the Telegram digest is readable

