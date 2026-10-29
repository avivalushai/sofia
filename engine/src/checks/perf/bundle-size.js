import { gzipSync } from "node:zlib";
import { all, attr } from "../../lib/html.js";
import { formatBytes } from "../../lib/text.js";

const HEAVY = 350 * 1024; // compressed

/** @type {import("../../types.js").Check} */
export default {
  id: "perf.bundle-size",
  layer: "mechanical",
  async run(ctx) {
    // a local dev server sends code unbundled and unminified: its size says nothing about the live site
    if (ctx.isLocalTarget && ctx.project.pkg?.scripts?.dev) return [ctx.skip("a local dev server doesn't bundle code; scan the live site (or a production build) to measure it")];
    const [home] = await ctx.crawl.pages();
    if (!home) return [ctx.pass()];
    const urls = new Set();
    for (const s of all(home.doc, "script")) if (attr(s, "src")) urls.add(new URL(attr(s, "src"), home.url).href);
    for (const l of all(home.doc, "link")) if (/modulepreload|preload/.test(attr(l, "rel") ?? "") && (attr(l, "as") === "script" || /modulepreload/.test(attr(l, "rel")))) urls.add(new URL(attr(l, "href"), home.url).href);
    // scripts the page loads once it runs (code-split chunks), when the browser is available
    if (ctx.browser) {
      const p = await ctx.browser.open(home.url, { width: 390 });
      for (const r of p.log.requests) if (r.type === "script") urls.add(r.url);
    }
    let total = 0;
    const sizes = [];
    for (const u of urls) {
      if (new URL(u).origin !== ctx.targetUrl.origin) continue; // other sites' scripts are perf.third-party's
      const res = await ctx.http.get(u, { as: "buffer" }).catch(() => null);
      if (!res || res.status !== 200 || res.blocked) continue;
      const gz = gzipSync(res.body).length;
      total += gz;
      sizes.push({ u: new URL(u).pathname, gz });
    }
    if (total <= HEAVY) return [ctx.pass()];
    sizes.sort((a, b) => b.gz - a.gz);
    return [ctx.fail({
      key: "site",
      title: `The first page loads ${formatBytes(total)} of code`,
      impact: "On a phone, all that code has to download and run before the page responds, so it feels slow and drains the battery",
      location: { url: home.path },
      evidence: `${formatBytes(total)} of JavaScript (compressed) on the home page; largest: ${sizes.slice(0, 3).map((s) => `${s.u} ${formatBytes(s.gz)}`).join(", ")} (aim for under ${formatBytes(HEAVY)})`,
      fix: "Load heavy parts only on the pages that use them (code splitting), remove libraries you don't use, and swap big ones for lighter ones (for example a date library or an icon set imported whole)",
    })];
  },
};
