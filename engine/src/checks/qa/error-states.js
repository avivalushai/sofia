import { dataRequests, ERROR_WORDS, shortUrl } from "../../lib/browser-checks.js";
import { skippedNote } from "../../lib/browser-checks.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.error-states",
  layer: "browser",
  async run(ctx) {
    const origin = new URL(ctx.target).origin;
    const results = [];
    const skipped = new Map();
    for (const page of (await ctx.crawl.browserPages()).slice(0, 10)) {
      const shared = await ctx.browser.open(page.url, { width: 1280 });
      const { urls: blockedUrls } = ctx.blockedOn(shared);
      if (blockedUrls.size) {
        for (const u of blockedUrls) skipped.set(u, ctx.browser.blocked.get(u));
        continue;
      }
      const data = dataRequests(shared.log, origin);
      if (!data.length) continue;
      const urls = new Set(data.map((r) => r.url));
      const normal = await shared.evaluate(() => window.__lc.visibleText());

      // the same page with its data requests failing, as when an API or a third-party service is down
      const broken = await ctx.browser.fresh(page.url, {
        width: 1280,
        beforeGoto: (pg) => pg.route("**/*", (route) => (urls.has(route.request().url()) ? route.abort("connectionrefused") : route.continue())),
      }, async (p) => ({
        text: await p.evaluate(() => window.__lc.visibleText()),
        retry: await p.evaluate(() => [...document.querySelectorAll("button, a")].some((b) => window.__lc.isVisible(b) && /retry|try again|reload|refresh|נסה שוב|נסו שוב|רענן/i.test(b.textContent))),
        shot: await p.screenshot(),
      }));
      const lost = normal.length - broken.text.length;
      const explained = ERROR_WORDS.test(broken.text) && !ERROR_WORDS.test(normal);
      if (lost < 200 || explained) continue; // the data didn't matter much, or the page says what went wrong
      results.push(ctx.fail({
        key: page.path,
        title: "When loading fails, the page goes blank without a word",
        impact: "If your server or a service you rely on hiccups, visitors see an empty page with no explanation and no way to try again",
        location: { url: page.path, viewport: 1280 },
        evidence: `With ${[...urls].slice(0, 3).map((u) => shortUrl(u, origin)).join(", ")} failing, ${lost} characters of content disappeared and no error message${broken.retry ? "" : " or retry button"} appeared`,
        fix: "Show a short message (\"Couldn't load this — try again\") with a retry button when loading fails",
        shot: broken.shot,
      }));
    }
    results.push(...skippedNote(ctx, skipped));
    return results.length ? results : [ctx.pass()];
  },
};
