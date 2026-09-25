import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { DB } from "./db.ts";
import { exportStatic } from "./export.ts";

/**
 * Publish the app + a fresh price snapshot to Vercel as a static site.
 * Uses the Vercel CLI login already on this machine (`npx vercel login`).
 * The staging folder keeps its `.vercel` link, so every run updates the same
 * project and URL.
 */

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const STAGE = path.join(ROOT, "server", ".vercel-deploy", "pricewise-israel");
const BUILD = path.join(ROOT, "server", ".vercel-build");

const VERCEL_JSON = {
  functions: { "api/recognize.mjs": { maxDuration: 60 } },
  headers: [
    { source: "/data/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=900, stale-while-revalidate=86400" }] },
    { source: "/assets/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
  ],
};

function run(cmd: string, args: string[], cwd: string): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { cwd, shell: true, encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/**
 * By default publishes the app only — prices come from the snapshot on GitHub
 * Pages (see .env.vercel). `withData: true` bundles a local snapshot instead.
 */
export function publishVercel(db: DB, log: (m: string) => void, opts: { deploy?: boolean; withData?: boolean } = {}): { url?: string } {
  // 1. Build the web app for static hosting (reads .env.vercel).
  log("בונה את האפליקציה…");
  const build = run("npx", ["vite", "build", "--mode", "vercel", "--outDir", `"${BUILD}"`, "--emptyOutDir"], ROOT);
  if (!build.ok) throw new Error(`build failed:\n${build.out.slice(-2000)}`);

  // 2. Fresh staging folder (keep the .vercel project link).
  fs.mkdirSync(STAGE, { recursive: true });
  for (const entry of fs.readdirSync(STAGE)) if (entry !== ".vercel") fs.rmSync(path.join(STAGE, entry), { recursive: true, force: true });
  fs.cpSync(BUILD, STAGE, { recursive: true });
  fs.writeFileSync(path.join(STAGE, "vercel.json"), JSON.stringify(VERCEL_JSON, null, 2));

  // AI photo recognition as a Vercel Function (one self-contained file; the key
  // comes from the project's ANTHROPIC_API_KEY environment variable).
  log("אורז את פונקציית זיהוי התמונות…");
  const fn = run(
    "npx",
    ["esbuild", "vercel/recognize-function.ts", "--bundle", "--platform=node", "--format=esm", "--target=node20",
     `--outfile="${path.join(STAGE, "api", "recognize.mjs")}"`,
     `"--banner:js=import { createRequire } from 'module'; const require = createRequire(import.meta.url);"`],
    ROOT,
  );
  if (!fn.ok) throw new Error(`function bundle failed:
${fn.out.slice(-2000)}`);

  // 3. Price snapshot (only when bundling data with the app).
  if (opts.withData) {
    log("מייצא תמונת מצב של המחירים…");
    const rep = exportStatic(db, STAGE, log);
    log(`  ${rep.products.toLocaleString()} מוצרים · ${(rep.bytes / 1e6).toFixed(1)}MB · ${Math.round(rep.ms / 1000)} שניות`);
    if (rep.bytes > 95e6) throw new Error(`snapshot is ${(rep.bytes / 1e6).toFixed(1)}MB — over Vercel Hobby's 100MB upload limit`);
  }

  if (opts.deploy === false) return {};

  // 4. Deploy (production).
  log("מעלה ל-Vercel…");
  const dep = run("npx", ["--yes", "vercel", "deploy", "--prod", "--yes"], STAGE);
  if (!dep.ok) throw new Error(`vercel deploy failed:\n${dep.out.slice(-2000)}`);
  const urls = dep.out.match(/https:\/\/[^\s]+\.vercel\.app/g) ?? [];
  return { url: urls.at(-1) };
}
