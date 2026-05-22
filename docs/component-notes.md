# Component Notes

These notes capture the current implementation assumptions checked before building the MVP files.

- Apify documents an n8n integration that can run Actors or tasks and retrieve dataset items. The workflow uses the equivalent HTTP API path so it remains portable across n8n installs: https://docs.apify.com/platform/integrations/n8n/
- Apify Actor runs can be invoked by API and their output read from datasets. The workflow uses a synchronous task run for the MVP: https://docs.apify.com/platform/actors/running
- n8n workflows are built from trigger, HTTP request, and code nodes. HTTP nodes keep this implementation independent of optional community nodes: https://docs.n8n.io/integrations/
- OpenAI Structured Outputs support strict JSON schema output through the Responses API `text.format` field. This is used for deterministic scoring records: https://platform.openai.com/docs/guides/structured-outputs
- Current OpenAI model guidance lists `gpt-5.4-mini` as a lower-latency, lower-cost model suitable for structured classification/scoring tasks; set `OPENAI_SCORING_MODEL` to override it: https://developers.openai.com/api/docs/models

The workflow deliberately avoids automated engagement actions. Recommended actions are labels for manual review only.
