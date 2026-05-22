import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(repoRoot, "..");
const outFile = path.join(projectRoot, "web", "public", "app.js");
const entryFile = path.join(projectRoot, "web", "src", "app.tsx");
const binCandidates = [
  path.join(projectRoot, "node_modules", ".bin", "esbuild"),
  ...readdirSync(path.join(projectRoot, "node_modules", ".pnpm"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("esbuild@"))
    .map((entry) => path.join(projectRoot, "node_modules", ".pnpm", entry.name, "node_modules", "esbuild", "bin", "esbuild"))
];

const esbuildBin = binCandidates.find((candidate) => existsSync(candidate));

if (!esbuildBin) {
  throw new Error("Unable to locate esbuild. Run pnpm install first.");
}

const args = [
  entryFile,
  "--bundle",
  "--format=esm",
  "--platform=browser",
  "--target=es2022",
  "--jsx=automatic",
  "--define:process.env.NODE_ENV=\"production\"",
  "--minify",
  "--outfile=" + outFile
];

if (process.argv.includes("--watch")) {
  args.push("--watch");
}

const result = spawnSync(esbuildBin, args, {
  cwd: projectRoot,
  stdio: "inherit"
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
