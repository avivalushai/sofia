import { all, attr } from "../../lib/html.js";
import { isLocalHost } from "../../lib/net.js";

const PREVIEW_HOST = /\.vercel\.app$|\.netlify\.app$|\.pages\.dev$|\.onrender\.com$|\.herokuapp\.com$|\.github\.io$|\.web\.app$|\.firebaseapp\.com$/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "seo.canonical",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    const results = [];
    const canon = new Map();
    for (const page of pages) {
      const href = all(page.doc, "link").find((l) => (attr(l, "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"));
      const value = href ? attr(href, "href") : null;
      let url = null;
      try {
        url = value ? new URL(value, page.url) : null;
      } catch {}
      canon.set(page.path, { value, url });
    }
    const withCanon = [...canon].filter(([, c]) => c.url);
    if (!withCanon.length) {
      if (pages.length < 2) return [ctx.pass()];
      return [ctx.fail({
        key: "site",
        title: "Pages don't say which address is their official one",
        impact: "The same page reachable at several addresses (with and without www, with tracking codes) can be counted as duplicates by Google, which splits its ranking",
        location: { url: pages[0].path, file: await ctx.pageSource(pages[0]) },
        evidence: `none of the ${pages.length} pages has <link rel="canonical">`,
        fix: 'Add <link rel="canonical" href="https://your-domain/page-path"> to each page (most frameworks have a setting for it)',
      })];
    }
    // the same official address on several different pages: usually every page pointing to the home page
    const byTarget = new Map();
    for (const [path, c] of withCanon) {
      const key = c.url.pathname.replace(/\/$/, "") || "/";
      byTarget.set(key, [...(byTarget.get(key) ?? []), path]);
    }
    for (const [target, paths] of byTarget) {
      const others = paths.filter((p) => (p.split("?")[0].replace(/\/$/, "").replace(/\.html$/, "") || "/") !== target.replace(/\.html$/, ""));
      if (paths.length < 2 || !others.length) continue;
      results.push(ctx.fail({
        key: `same:${target}`,
        title: `${paths.length} pages tell Google they're the same page`,
        impact: `Google is told that ${others.slice(0, 2).join(", ")}${others.length > 2 ? "…" : ""} are copies of ${target}, so it may leave them out of search results`,
        location: { url: others[0], file: await ctx.pageSource(pages.find((p) => p.path === others[0])) },
        evidence: `${paths.slice(0, 5).join(", ")} all have canonical ${target}`,
        fix: "Give each page a canonical address of its own (its own path)",
      }));
    }
    if (!ctx.isLocalTarget) {
      for (const [path, c] of withCanon) {
        const h = c.url.hostname;
        if (h === ctx.targetUrl.hostname) continue;
        if (isLocalHost(h) || (PREVIEW_HOST.test(h) && !PREVIEW_HOST.test(ctx.targetUrl.hostname))) {
          results.push(ctx.fail({
            key: `host:${path}`,
            title: "A page points Google to a test address",
            impact: "Google is told the official version of this page lives on a development or preview address, so the real page may drop out of search",
            location: { url: path, file: await ctx.pageSource(pages.find((p) => p.path === path)) },
            evidence: `canonical is ${c.value}`,
            fix: "Use your real domain in the canonical address",
          }));
        }
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
