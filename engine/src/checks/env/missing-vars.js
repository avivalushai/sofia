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

    const defined = new Set();
    for (const f of ctx.project.files.filter((f) => ENV_FILE.test(f) || /(^|\/)(vercel\.json|netlify\.toml|wrangler\.toml|render\.yaml|fly\.toml)$/.test(f))) {
      const text = (await ctx.project.read(f)) ?? "";
      for (const m of text.matchAll(/^\s*(?:export\s+)?["']?([A-Z][A-Z0-9_]*)["']?\s*[=:]/gm)) defined.add(m[1]);
    }

    const results = [];
    for (const [name, where] of [...used].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (defined.has(name)) continue;
      results.push(ctx.fail({
        key: name,
        title: "The app needs a setting that isn't defined anywhere",
        impact: "On the live site this setting is empty, so the part of the app that uses it breaks — often silently",
        location: where,
        evidence: `${name} is used in ${where.file} but isn't in any .env file or host config in the project`,
        fix: `1. Find the value for ${name} (usually in the dashboard of the service it belongs to). 2. Add it in your host's environment settings — on Vercel: Project → Settings → Environment Variables. 3. I'll add ${name} to .env.example so it's documented. 4. Tell me when it's done and I'll re-check.`,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
