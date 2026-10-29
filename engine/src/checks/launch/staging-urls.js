import { codeKeys, scanSource } from "../../lib/code.js";

const STAGING = /\bhttps?:\/\/(?:[a-z0-9-]+-git-[a-z0-9-]+\.vercel\.app|[a-z0-9-]+-[a-z0-9]{9}-[a-z0-9-]+\.vercel\.app|deploy-preview-\d+--[a-z0-9-]+\.netlify\.app|[a-z0-9-]+\.ngrok(?:-free)?\.(?:io|app|dev)|[a-z0-9-]+\.trycloudflare\.com|[a-z0-9-]+\.loca\.lt|(?:staging|stage|preview|dev)[.-][a-z0-9.-]+\.[a-z]{2,})[^\s"'`)<>]*/gi;

/** @type {import("../../types.js").Check} */
export default {
  id: "launch.staging-urls",
  layer: "mechanical",
  async run(ctx) {
    const own = ctx.targetUrl.hostname;
    const key = codeKeys();
    const results = [];
    const seen = new Set();
    for (const { file, line, lineText, match } of await scanSource(ctx.project, STAGING, { skipComments: true })) {
      if (new URL(match[0]).hostname === own) continue;
      seen.add(match[0]);
      results.push(ctx.fail({
        key: key(file, lineText),
        title: "The app points to a test version of the site",
        impact: "Visitors get sent to, or load data from, a preview copy that may be out of date or switched off",
        location: { file, line },
        evidence: `${match[0]} in ${file}`,
        fix: "Replace it with the live address, or a relative path",
      }));
    }
    if (!ctx.isLocalTarget) {
      for (const { where, code } of [...(await ctx.crawl.pages()).map((p) => ({ where: p.path, code: p.html })), ...(await ctx.crawl.scripts())]) {
        for (const m of code.matchAll(STAGING)) {
          if (seen.has(m[0]) || new URL(m[0]).hostname === own) continue;
          seen.add(m[0]);
          results.push(ctx.fail({
            key: `served_${m[0]}`,
            title: "The live site points to a test version of the site",
            impact: "Visitors get sent to, or load data from, a preview copy that may be out of date or switched off",
            location: { url: where },
            evidence: `${m[0]} in ${where}`,
            fix: "Replace it with the live address — check your host's environment settings too",
          }));
        }
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
