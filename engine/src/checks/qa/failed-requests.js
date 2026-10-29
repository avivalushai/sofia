import { otherLocalService, shortUrl, skippedNote } from "../../lib/browser-checks.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.failed-requests",
  layer: "browser",
  async run(ctx) {
    const origin = new URL(ctx.target).origin;
    const failed = new Map();
    const skipped = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      const { urls: blockedUrls } = ctx.blockedOn(p);
      const pageUrl = p.url.split("#")[0];
      const bad = [
        ...[...p.log.responses].filter(([u, s]) => s >= 400 && u.split("#")[0] !== pageUrl).map(([u, s]) => ({ url: u, why: `returned ${s}` })),
        ...p.log.failed.filter((f) => !/ERR_ABORTED/.test(f.error)).map((f) => ({ url: f.url, why: `never finished (${f.error})` })),
      ];
      for (const b of bad) {
        if (blockedUrls.has(b.url)) {
          skipped.set(b.url, ctx.browser.blocked.get(b.url));
          continue;
        }
        if (otherLocalService(ctx, b)) {
          // the app expects another service on this machine (a local API or live server) that isn't running
          skipped.set(b.url, "this local copy (another local service the app uses isn't running)");
          continue;
        }
        if (!failed.has(b.url)) failed.set(b.url, { ...b, pages: [] });
        failed.get(b.url).pages.push(page.path);
      }
    }
    if (!failed.size) return skipped.size ? skippedNote(ctx, skipped) : [ctx.pass()];
    const list = [...failed].sort(([a], [z]) => (a < z ? -1 : 1));
    // one finding per page: the fix is usually "look at what this page asks for"
    const byPage = new Map();
    for (const [url, b] of list) {
      const first = b.pages[0];
      if (!byPage.has(first)) byPage.set(first, []);
      byPage.get(first).push(`${shortUrl(url, origin)} ${b.why}`);
    }
    return [...skippedNote(ctx, skipped), ...[...byPage].map(([path, items]) => ctx.fail({
      key: path,
      title: items.length === 1 ? "The page asks for something that fails to load" : `The page asks for ${items.length} things that fail to load`,
      impact: "Missing pieces make parts of the page look broken or stop working, and slow it down while the browser waits",
      location: { url: path },
      evidence: items.slice(0, 6).join("; ") + (items.length > 6 ? `; and ${items.length - 6} more` : ""),
      fix: "Fix or remove each failing address — add missing files, correct paths, or drop calls to services that no longer exist",
    }))];
  },
};
