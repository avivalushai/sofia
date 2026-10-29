import { all, textOf } from "../../lib/html.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "seo.single-h1",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    // what search engines index is the rendered page; without the browser, the HTML as sent
    const pages = ctx.browser ? await ctx.crawl.browserPages() : await ctx.crawl.pages();
    for (const page of pages) {
      let heads;
      if (ctx.browser) {
        const p = await ctx.browser.open(page.url, { width: 1280 });
        heads = await p.evaluate(() => [...document.querySelectorAll("h1")].filter((h) => window.__lc.isVisible(h)).map((h) => h.innerText.trim().slice(0, 60)));
      } else {
        heads = all(page.doc, "h1").map((h) => textOf(h).trim().slice(0, 60));
      }
      if (heads.length === 1) continue;
      results.push(ctx.fail({
        key: page.path,
        title: heads.length ? `This page has ${heads.length} main headings` : "This page has no main heading",
        impact: heads.length
          ? "Search engines and screen readers use the main heading to understand what the page is about; several of them blur that"
          : "Search engines and screen readers look for the main heading to understand what the page is about, and find none",
        location: { url: page.path, file: await ctx.pageSource(page) },
        evidence: heads.length ? heads.map((h) => `"${h}"`).join(", ") : "no visible <h1>",
        fix: heads.length ? "Keep one <h1> for the page's main topic and make the others <h2>" : "Make the page's main title an <h1>",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
