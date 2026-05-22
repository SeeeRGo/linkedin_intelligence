import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENV_FILES = [".env.local", ".env"];
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const unescapeQuotedValue = (value) =>
  value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\\\/g, "\\").replace(/\\"/g, '"').replace(/\\'/g, "'");

const parseEnvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trimStart() : trimmed;
  const equalsIndex = normalized.indexOf("=");
  if (equalsIndex === -1) return null;

  const key = normalized.slice(0, equalsIndex).trim();
  if (!key) return null;

  let value = normalized.slice(equalsIndex + 1).trim();
  if (!value) return { key, value: "" };

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
    if (quote === '"') value = unescapeQuotedValue(value);
  } else {
    const inlineCommentIndex = value.indexOf(" #");
    if (inlineCommentIndex >= 0) value = value.slice(0, inlineCommentIndex).trimEnd();
  }

  return { key, value };
};

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
};

export const loadEnv = (cwd = repoRoot) => {
  for (const fileName of ENV_FILES) {
    loadEnvFile(path.resolve(cwd, fileName));
  }
};

loadEnv();
