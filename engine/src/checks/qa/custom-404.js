const MISSING_PATH = "/launch-check-page-that-does-not-exist";

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.custom-404",
  layer: "browser",
  async run(ctx) {
    const url = new URL(MISSING_PATH, ctx.target).href;
    const p = await ctx.browser.open(url, { width: 1280 });
    const page = await p.evaluate(() => ({
      text: window.__lc.visibleText(),
      links: [...document.querySelectorAll("a[href]")].filter((a) => window.__lc.isVisible(a) && new URL(a.href).origin === location.origin).length,
      styled: document.styleSheets.length > 0 || [...document.querySelectorAll("[style]")].length > 0,
    }));
    // a dead end: nothing to click back into the site
    if (page.links > 0) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "A wrong address shows a bare error page",
      impact: "People who follow an old or mistyped link see a blank technical page with no way back, and leave",
      location: { url: MISSING_PATH, viewport: 1280 },
      evidence: `${MISSING_PATH} returned ${p.status ?? "no status"} with ${page.links} links back to the site${page.text ? `: "${page.text.slice(0, 60)}"` : ""}`,
      fix: "Add a friendly not-found page in the site's design, with a link to the home page and the main sections",
      shot: await p.screenshot(),
    })];
  },
};
