import { findSecrets, mask, PUBLIC_ENV_PREFIX, SECRET_NAME } from "../../lib/secrets.js";

const PUBLIC_SECRET_FIX = (name) =>
  `1. I'll move the code that uses ${name} to the server so the browser never sees it. ` +
  "2. Rotate the key — it's already public, so the old one must stop working: ";

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.client-secrets",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    const seen = new Set();

    // 1. What the browser actually receives: page HTML and same-origin scripts
    const pages = await ctx.crawl.pages();
    const shipped = [...pages.map((p) => ({ where: p.path, code: p.html })), ...(await ctx.crawl.scripts()).filter((s) => !pages.some((p) => p.url === s.url))];
    for (const { where, code } of shipped) {
      for (const hit of findSecrets(code)) {
        const key = `${hit.pattern.id}_${mask(hit.value)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const source = await ctx.guessSource(hit.value);
        results.push(ctx.fail({
          key,
          title: "A secret key is visible to anyone who opens the site",
          impact: "Anyone can copy it from the browser and use your account — run up charges, read your data or send email as you",
          location: { url: where, ...(source ?? {}) },
          evidence: `${hit.pattern.name} (${mask(hit.value)}) is in code the browser downloads (${where})`,
          fix: `${PUBLIC_SECRET_FIX(`the ${hit.pattern.name}`)}${hit.pattern.rotate}. 3. Put the new key in your host's environment settings, under a name that doesn't start with NEXT_PUBLIC_ or VITE_.`,
        }));
      }
    }

    // 2. Env files: secrets under a prefix that frameworks copy into browser code
    for (const file of ctx.project.files.filter((f) => /(^|\/)\.env(\.[\w.-]+)?$/.test(f) && !/example|sample|template/.test(f))) {
      const text = (await ctx.project.read(file)) ?? "";
      for (const [i, line] of text.split("\n").entries()) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?([^"'\s#]*)/);
        if (!m || !PUBLIC_ENV_PREFIX.test(m[1]) || !m[2]) continue;
        const looksSecret = SECRET_NAME.test(m[1].replace(PUBLIC_ENV_PREFIX, "")) || findSecrets(m[2]).length > 0;
        if (!looksSecret) continue;
        const key = `env_${m[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const pattern = findSecrets(m[2])[0]?.pattern;
        results.push(ctx.fail({
          key,
          title: "A secret setting is marked to be sent to the browser",
          impact: "Settings with this prefix are copied into the site's public code, so anyone can read the value and use it",
          location: { file, line: i + 1 },
          evidence: `${m[1]} in ${file}: the ${m[1].match(PUBLIC_ENV_PREFIX)[1]} prefix makes it public`,
          fix: `${PUBLIC_SECRET_FIX(m[1])}${pattern?.rotate ?? "in the dashboard of the service that issued it"}. 3. Rename it without the ${m[1].match(PUBLIC_ENV_PREFIX)[1]} prefix, here and in your host's environment settings.`,
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
