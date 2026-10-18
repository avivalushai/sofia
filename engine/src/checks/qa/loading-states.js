import { dataRequests } from "../../lib/browser-checks.js";

const DELAY_MS = 3000;

/** Runs in the page: is anything telling the visitor that content is on its way? */
function hasLoadingIndicator() {
  const re = /spin|load|skeleton|shimmer|placeholder|pulse|progress/i;
  return [...document.querySelectorAll("body *")].some((el) => {
    if (!window.__lc.isVisible(el)) return false;
    if (el.getAttribute("aria-busy") === "true" || ["progressbar", "status"].includes(el.getAttribute("role"))) return true;
    if (re.test(`${typeof el.className === "string" ? el.className : el.className?.baseVal ?? ""} ${el.id}`)) return true;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    return /^(loading|טוען|רגע)/i.test(own) || (own.endsWith("…") && own.length < 20);
  });
}

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.loading-states",
  layer: "browser",
  async run(ctx) {
    const origin = new URL(ctx.target).origin;
    const results = [];
    for (const page of (await ctx.crawl.browserPages()).slice(0, 10)) {
      const shared = await ctx.browser.open(page.url, { width: 1280 });
      const urls = new Set(dataRequests(shared.log, origin).map((r) => r.url));
      if (!urls.size) continue; // the content is in the page itself: nothing to wait for
      const fullText = (await shared.evaluate(() => window.__lc.visibleText())).length;

      // load again with the data held back, and look while it's still on its way
      const during = await ctx.browser.fresh(page.url, {
        width: 1280,
        waitUntil: "domcontentloaded",
        idle: false,
        settleMs: 1000,
        beforeGoto: (pg) => pg.route("**/*", async (route) => {
          if (urls.has(route.request().url())) await new Promise((r) => setTimeout(r, DELAY_MS));
          return route.continue().catch(() => {});
        }),
      }, async (p) => ({
        indicator: await p.evaluate(hasLoadingIndicator),
        text: (await p.evaluate(() => window.__lc.visibleText())).length,
        shot: await p.screenshot(),
      }));
      // only a problem when the waiting page is visibly missing content and says nothing
      if (during.indicator || fullText - during.text < 200) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "While content loads, the page just looks empty",
        impact: "On a slow connection visitors see a blank or half-empty page with no sign anything is coming, and leave or reload",
        location: { url: page.path, viewport: 1280 },
        evidence: `With the data delayed ${DELAY_MS / 1000}s, ${fullText - during.text} characters of content were missing and no loading indicator was shown`,
        fix: "Show a loading indicator or grey placeholder shapes where the content will appear",
        shot: during.shot,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
