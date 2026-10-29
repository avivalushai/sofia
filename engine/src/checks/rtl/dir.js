import { attr, first, hebrewRatio } from "../../lib/html.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "rtl.dir",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      const hebrew = /^(he|iw)\b/i.test(page.lang ?? "") || hebrewRatio(page.text) > 0.3;
      if (!hebrew) continue;
      const dir = (attr(first(page.doc, "html"), "dir") ?? attr(first(page.doc, "body"), "dir") ?? "").toLowerCase();
      if (dir === "rtl") continue;
      results.push(ctx.fail({
        key: page.path,
        title: "The Hebrew page is laid out left to right",
        impact: "Text aligns to the wrong side, punctuation jumps to the start of lines and menus appear mirrored",
        location: { url: page.path, file: await ctx.pageSource(page) },
        evidence: dir ? `dir="${dir}" on a Hebrew page` : "No dir attribute on <html> or <body> of a Hebrew page",
        fix: 'Add dir="rtl" to the <html> tag',
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
