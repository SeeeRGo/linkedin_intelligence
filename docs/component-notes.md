# Component Notes

- Apify is used directly from the Node.js pipeline to run profile search, author post collection, and comment collection tasks.
- OpenAI Structured Outputs are used for deterministic author, post, and comment scoring.
- Convex is the only supported persistence layer for the web app.
- The system deliberately avoids automated engagement actions. Recommended actions are labels for manual review only.
