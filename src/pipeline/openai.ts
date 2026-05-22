import { readFile } from "node:fs/promises";
import type { ScoreResult } from "./types.js";

type OpenAIOptions = {
  apiKey: string;
  model: string;
};

const loadPrompt = async () => readFile("prompts/scoring_system.md", "utf8");
const loadSchema = async () => JSON.parse(await readFile("schemas/openai/discourse_score.schema.json", "utf8"));

const extractOutputText = (body: unknown): string => {
  const response = body as Record<string, unknown>;
  if (typeof response.output_text === "string") return response.output_text;

  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as Record<string, unknown>[])
      : [];
    for (const part of content) {
      if (typeof part.text === "string") return part.text;
      if (typeof part.content === "string") return part.content;
    }
  }

  throw new Error("OpenAI response did not include output text.");
};

export const scoreRecord = async (record: unknown, options: OpenAIOptions): Promise<ScoreResult> => {
  if (!options.apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const [systemPrompt, schema] = await Promise.all([loadPrompt(), loadSchema()]);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: options.model,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this normalized LinkedIn record and return strict JSON.\n\n${JSON.stringify(record, null, 2)}`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "discourse_score",
          strict: true,
          schema
        }
      }
    })
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${text}`);
  }

  return JSON.parse(extractOutputText(body)) as ScoreResult;
};

export const failedScore = (record: { canonical_id: string; content_type: "post" | "comment" }, error: unknown): ScoreResult => ({
  canonical_id: record.canonical_id,
  content_type: record.content_type,
  language: "unknown",
  author_type: "unknown",
  author_score: 0,
  post_score: 0,
  comment_score: 0,
  discussion_value: 0,
  strategic_interaction_potential: 0,
  recommended_action: "ignore",
  relevance_tags: ["low_value"],
  low_value_flags: ["none"],
  emerging_themes: [],
  why_relevant: "",
  key_thesis: "",
  rationale: error instanceof Error ? `Scoring failed: ${error.message}` : "Scoring failed.",
  confidence: 0
});
