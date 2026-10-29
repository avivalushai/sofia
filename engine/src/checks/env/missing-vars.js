import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { scanSource } from "../../lib/code.js";

const USE = /(?:process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]|import\.meta\.env\.([A-Z][A-Z0-9_]*))(\s*(?:\|\||\?\?))?/g;
/** set by the platform or the framework, never by the owner */
const BUILT_IN = /^(NODE_ENV|PORT|HOST|HOSTNAME|CI|TZ|HOME|PWD|DEBUG|MODE|DEV|PROD|SSR|BASE_URL|NEXT_RUNTIME|NEXT_PHASE|VERCEL.*|NEXT_PUBLIC_VERCEL_.*|NETLIFY.*|CONTEXT|DEPLOY_.*|URL|CF_PAGES.*|RENDER.*|RAILWAY_.*|FLY_.*|npm_.*|GITHUB_.*|AWS_REGION|AWS_LAMBDA_.*|LAMBDA_.*)$/;
const ENV_FILE = /(^|\/)(\.env(\.[\w.-]+)?|\.dev\.vars)$/;

/** @type {import("../../types.js").Check} */
export default {
  id: "env.missing-vars",
  layer: "mechanical",
  async run(ctx) {
    const used = new Map();
    for (const { file, line, match } of await scanSource(ctx.project, USE, { skipComments: true })) {
      const name = match[1] ?? match[2] ?? match[3];
      if (BUILT_IN.test(name) || match[4]) continue; // has a fallback value
      if (!used.has(name)) used.set(name, { file, line });
    }
    if (!used.size) return [ctx.pass()];

    // .env files are usually git-ignored, so look for them directly, not in the project's file list
    const envFiles = [...new Set([...ctx.project.files.filter((f) => ENV_FILE.test(f)), ...(await ignoredEnvFiles(ctx.project.root))])];
    const configs = ctx.project.files.filter((f) => /(^|\/)(vercel\.json|netlify\.toml|wrangler\.toml|render\.yaml|fly\.toml)$/.test(f));
    const defined = new Set();
    for (const f of [...envFiles, ...configs]) {
      const text = (await readFile(path.join(ctx.project.root, f), "utf8").catch(() => "")) ?? "";
      for (const m of text.matchAll(/^\s*(?:export\s+)?["']?([A-Z][A-Z0-9_]*)["']?\s*[=:]/gm)) defined.add(m[1]);
    }

    const missing = [...used].filter(([name]) => !defined.has(name)).sort(([a], [b]) => (a < b ? -1 : 1));
    if (!missing.length) return [ctx.pass()];
    // nothing in the project lists its settings: they may all live in the host's dashboard
    if (!envFiles.length) {
      return [ctx.uncertain({
        key: "host-settings",
        title: "Couldn't see where the app's settings are kept",
        evidence: `The code needs ${missing.map(([n]) => n).join(", ")}, and no .env file in the project lists them — they may be set only in the host's dashboard`,
        location: missing[0][1],
        fix: `Check these are set in your host's environment settings (on Vercel: Project → Settings → Environment Variables): ${missing.map(([n]) => n).join(", ")}. I can add a .env.example that lists them.`,
      })];
    }

    const results = [];
    for (const [name, where] of missing) {
      results.push(ctx.fail({
        key: name,
        title: "The app needs a setting that isn't defined anywhere",
        impact: "On the live site this setting is empty, so the part of the app that uses it breaks — often silently",
        location: where,
        evidence: `${name} is used in ${where.file} but isn't in ${envFiles.join(", ")} or any host config in the project`,
        fix: `1. Find the value for ${name} (usually in the dashboard of the service it belongs to). 2. Add it in your host's environment settings — on Vercel: Project → Settings → Environment Variables. 3. I'll add ${name} to .env.example so it's documented. 4. Tell me when it's done and I'll re-check.`,
      }));
    }
    return results;
  },
};

/** .env files at the root and one level down, including ones git ignores. */
async function ignoredEnvFiles(root) {
  const out = [];
  for (const dir of ["", ...(await readdir(root, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules").map((d) => d.name)]) {
    for (const e of await readdir(path.join(root, dir), { withFileTypes: true }).catch(() => [])) {
      if (e.isFile() && ENV_FILE.test(e.name)) out.push(dir ? `${dir}/${e.name}` : e.name);
    }
  }
  return out.sort();
}
