import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const workflow = readJson('n8n/workflows/daily_digest.workflow.json');
const singlePostWorkflow = readJson('n8n/workflows/single_post_scoring.workflow.json');
const scoreSchema = readJson('schemas/openai/discourse_score.schema.json');
const authorScoreSchema = readJson('schemas/openai/author_score.schema.json');
const airtableSchema = readJson('airtable/schema.json');
const benchmark = readJson('n8n/fixtures/benchmark_input.json');
const requiredFiles = [
  'src/server.ts',
  'src/pipeline/apify.ts',
  'src/pipeline/openai.ts',
  'src/pipeline/runPipeline.ts',
  'prompts/author_scoring_system.md',
  'schemas/openai/author_score.schema.json',
  'convex/schema.ts',
  'convex/taskConfigs.ts',
  'convex/authors.ts',
  'convex/posts.ts',
  'convex/comments.ts',
  'convex/runs.ts',
  'web/public/index.html',
  'web/public/app.js',
  'web/public/styles.css'
];

for (const path of requiredFiles) {
  assert(fs.existsSync(path), `Required web app artifact is missing: ${path}`);
}

assert(workflow.nodes.some((node) => node.name === 'Run Apify Posts Task'), 'Workflow is missing posts Apify task node.');
assert(workflow.nodes.some((node) => node.name === 'Run Apify Comments Task'), 'Workflow is missing comments Apify task node.');
assert(workflow.nodes.some((node) => node.name === 'Prepare Apify Posts Task Input'), 'Workflow is missing Apify input prep node.');
assert(workflow.nodes.some((node) => node.name === 'Prepare Top Post Comment Inputs'), 'Workflow is missing top-post comment prep node.');
assert(workflow.nodes.some((node) => node.name === 'Score Posts with OpenAI'), 'Workflow is missing posts scoring node.');
assert(workflow.nodes.some((node) => node.name === 'Score Comments with OpenAI'), 'Workflow is missing comments scoring node.');
assert(workflow.nodes.some((node) => node.name === 'Merge Scored Posts and Comments'), 'Workflow is missing scored-post/comment merge node.');
assert(workflow.nodes.some((node) => node.name === 'Send Telegram Digest'), 'Workflow is missing Telegram delivery node.');
assert(singlePostWorkflow.nodes.some((node) => node.name === 'Prepare Test Link'), 'Single post workflow is missing URL input node.');
assert(singlePostWorkflow.nodes.some((node) => node.name === 'Run Apify Task'), 'Single post workflow is missing Apify task node.');
assert(singlePostWorkflow.nodes.some((node) => node.name === 'Normalize Apify Results'), 'Single post workflow is missing Apify normalization node.');
assert(singlePostWorkflow.nodes.some((node) => node.name === 'Score with OpenAI'), 'Single post workflow is missing OpenAI scoring node.');
assert(singlePostWorkflow.nodes.some((node) => node.name === 'Parse Score'), 'Single post workflow is missing parse node.');

for (const node of workflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.code')) {
  new Function('items', '$env', node.parameters.jsCode);
}

for (const node of singlePostWorkflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.code')) {
  new Function('items', '$env', node.parameters.jsCode);
}

const requiredScoreFields = [
  'author_score',
  'post_score',
  'comment_score',
  'discussion_value',
  'strategic_interaction_potential',
  'recommended_action',
  'relevance_tags',
  'low_value_flags'
];

for (const field of requiredScoreFields) {
  assert(scoreSchema.required.includes(field), `Score schema is missing required field: ${field}`);
}

const requiredAuthorFields = [
  'canonical_id',
  'content_type',
  'language',
  'author_type',
  'author_score',
  'recommended_action',
  'relevance_tags',
  'low_value_flags',
  'power_signals'
];

for (const field of requiredAuthorFields) {
  assert(authorScoreSchema.required.includes(field), `Author score schema is missing required field: ${field}`);
}

const tableNames = new Set(airtableSchema.tables.map((table) => table.name));
for (const tableName of ['Authors', 'Posts', 'Comments', 'Daily_Digests']) {
  assert(tableNames.has(tableName), `Airtable schema is missing table: ${tableName}`);
}

const postsTable = airtableSchema.tables.find((table) => table.name === 'Posts');
const digestTable = airtableSchema.tables.find((table) => table.name === 'Daily_Digests');
assert(postsTable.fields.some((field) => field.name === 'Search Keywords Text'), 'Posts table is missing Search Keywords Text field.');
assert(digestTable.fields.some((field) => field.name === 'Search Keywords Text'), 'Daily_Digests table is missing Search Keywords Text field.');

assert(benchmark.expected.post_score === 'high', 'Benchmark fixture must expect a high post score.');
assert(benchmark.url.includes('linkedin.com/posts/'), 'Benchmark fixture must include a LinkedIn post URL.');

console.log('Artifact validation passed.');
