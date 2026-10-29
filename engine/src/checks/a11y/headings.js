import { DomUtils } from "htmlparser2";
import { textOf } from "../../lib/html.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "a11y.headings",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    const pages = ctx.browser ? await ctx.crawl.browserPages() : await ctx.crawl.pages();
    for (const page of pages) {
      let heads;
      if (ctx.browser) {
        const p = await ctx.browser.open(page.url, { width: 1280 });
        heads = await p.evaluate(() => [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((h) => window.__lc.isVisible(h)).map((h) => ({ level: Number(h.localName[1]), text: h.innerText.trim().slice(0, 40) })));
      } else {
        heads = DomUtils.findAll((el) => /^h[1-6]$/.test(el.name), page.doc.children).map((h) => ({ level: Number(h.name[1]), text: textOf(h).trim().slice(0, 40) }));
      }
      const skips = [];
      for (let i = 1; i < heads.length; i++) if (heads[i].level > heads[i - 1].level + 1) skips.push(`"${heads[i - 1].text}" (h${heads[i - 1].level}) is followed by "${heads[i].text}" (h${heads[i].level})`);
      if (!skips.length) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "Headings skip levels",
        impact: "Screen-reader users jump through a page by its headings; skipped levels make it look like parts are missing, and search engines read the outline less clearly",
        location: { url: page.path, file: await ctx.pageSource(page) },
        evidence: skips.slice(0, 3).join("; "),
        fix: "Use heading levels in order (h1, then h2, then h3); change the size with CSS rather than by picking a smaller heading",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
