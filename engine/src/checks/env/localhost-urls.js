import { codeKeys, scanSource } from "../../lib/code.js";

export const LOCAL_URL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s"'`)<>]*/g;
/** lines that are only about local development: env switches and "server running at" logs */
const DEV_ONLY = /development|NODE_ENV|import\.meta\.env\.DEV|\.listen\(|console\.|isDev|__DEV__/;

/** @type {import("../../types.js").Check} */
export default {
  id: "env.localhost-urls",
  layer: "mechanical",
  async run(ctx) {
    const key = codeKeys();
    const results = [];
    const seen = new Set();
    for (const { file, line, lineText, match } of await scanSource(ctx.project, LOCAL_URL, { skipComments: true })) {
      if (DEV_ONLY.test(lineText)) continue;
      const k = key(file, lineText);
      seen.add(match[0]);
      results.push(ctx.fail({
        key: k,
        title: "The app calls an address that only exists on your computer",
        impact: "On the live site this request goes nowhere, so whatever depends on it — forms, data, logins — silently fails for every visitor",
        location: { file, line },
        evidence: `${match[0]} in ${file}`,
        fix: "Use the live address instead, or a relative path like /api/… so it works wherever the site runs",
      }));
    }

    // a live site: also check the built code the browser gets, which may come from config or env
    if (!ctx.isLocalTarget) {
      for (const { where, code } of await ctx.crawl.scripts()) {
        for (const m of code.matchAll(LOCAL_URL)) {
          if (seen.has(m[0])) continue;
          seen.add(m[0]);
          results.push(ctx.fail({
            key: `served_${where}_${m[0]}`,
            title: "The live site calls an address that only exists on your computer",
            impact: "Whatever depends on it — forms, data, logins — silently fails for every visitor",
            location: { url: where },
            evidence: `${m[0]} in ${where}`,
            fix: "Set the real address in your host's environment settings, or use a relative path like /api/…",
          }));
        }
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
