import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const scoreSchema = readJson("schemas/openai/discourse_score.schema.json");
const authorScoreSchema = readJson("schemas/openai/author_score.schema.json");
const requiredFiles = [
  "README.md",
  "src/server.ts",
  "src/pipeline/apify.ts",
  "src/pipeline/openai.ts",
  "src/pipeline/runPipeline.ts",
  "prompts/scoring_system.md",
  "prompts/author_scoring_system.md",
  "schemas/openai/discourse_score.schema.json",
  "schemas/openai/author_score.schema.json",
  "convex/schema.ts",
  "convex/taskConfigs.ts",
  "convex/authors.ts",
  "convex/posts.ts",
  "convex/comments.ts",
  "convex/runs.ts",
  "web/public/index.html",
  "web/public/app.js",
  "web/public/styles.css"
];

for (const path of requiredFiles) {
  assert(fs.existsSync(path), `Required web app artifact is missing: ${path}`);
}

for (const field of [
  "author_score",
  "post_score",
  "comment_score",
  "discussion_value",
  "strategic_interaction_potential",
  "recommended_action",
  "relevance_tags",
  "low_value_flags"
]) {
  assert(scoreSchema.required.includes(field), `Score schema is missing required field: ${field}`);
}

for (const field of [
  "canonical_id",
  "content_type",
  "language",
  "author_type",
  "author_score",
  "recommended_action",
  "relevance_tags",
  "low_value_flags",
  "power_signals"
]) {
  assert(authorScoreSchema.required.includes(field), `Author score schema is missing required field: ${field}`);
}

console.log("Artifact validation passed.");
