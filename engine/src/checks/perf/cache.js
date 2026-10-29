import { all, attr } from "../../lib/html.js";

const STATIC = /\.(js|mjs|css|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "perf.cache",
  layer: "mechanical",
  async run(ctx) {
    // a local server's headers aren't the host's
    if (ctx.isLocalTarget) return [ctx.skip("scanning a local address — caching and compression are set by your host on the live site")];
    const [home] = await ctx.crawl.pages();
    if (!home) return [ctx.pass()];
    const problems = [];
    const html = await ctx.http.request(home.url, { headers: { "accept-encoding": "br, gzip" }, as: "none" }).catch(() => null);
    if (html && !html.blocked && !/(br|gzip|zstd|deflate)/.test(html.headers["content-encoding"] ?? "")) problems.push("the page itself is sent uncompressed");
    const assets = [];
    for (const s of all(home.doc, "script")) if (attr(s, "src")) assets.push(attr(s, "src"));
    for (const l of all(home.doc, "link")) if (/stylesheet|icon|preload/.test(attr(l, "rel") ?? "")) assets.push(attr(l, "href"));
    for (const i of all(home.doc, "img")) if (attr(i, "src")) assets.push(attr(i, "src"));
    const uncached = [];
    for (const a of [...new Set(assets)].slice(0, 12)) {
      let u;
      try {
        u = new URL(a, home.url);
      } catch {
        continue;
      }
      if (u.origin !== ctx.targetUrl.origin || !STATIC.test(u.pathname)) continue;
      const r = await ctx.http.request(u.href, { method: "HEAD", as: "none" }).catch(() => null);
      if (!r || r.blocked || r.status !== 200) continue;
      const cc = r.headers["cache-control"] ?? "";
      const maxAge = Number(cc.match(/max-age=(\d+)/)?.[1] ?? 0);
      if (/no-store|no-cache/.test(cc) || maxAge < 86400) uncached.push(`${u.pathname} (${cc || "no Cache-Control"})`);
    }
    if (uncached.length) problems.push(`files are re-downloaded on every visit: ${uncached.slice(0, 4).join(", ")}`);
    if (!problems.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "The site makes browsers download the same files again and again",
      impact: "Returning visitors wait for files they already have, and every visit costs more data and time than it needs to",
      location: { url: home.path },
      evidence: problems.join("; "),
      fix: "Turn on compression (gzip or Brotli) in the host settings, and cache static files for a long time (Cache-Control: public, max-age=31536000, immutable for files whose names change with each build)",
    })];
  },
};
