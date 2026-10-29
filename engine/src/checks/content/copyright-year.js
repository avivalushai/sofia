const COPYRIGHT = /(?:©|\(c\)|copyright|כל הזכויות שמורות)\s*(?:(?:19|20)\d{2}\s*[-–—]\s*)?((?:19|20)\d{2})|((?:19|20)\d{2})\s*©/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "content.copyright-year",
  layer: "mechanical",
  async run(ctx) {
    const year = ctx.now.getFullYear();
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      const segment = page.segments.find((s) => COPYRIGHT.test(s));
      if (!segment) continue;
      const m = segment.match(COPYRIGHT);
      const found = Number(m[1] ?? m[2]);
      if (found >= year) continue;
      const source = await ctx.guessSource(m[0], page);
      results.push(ctx.fail({
        key: page.path,
        title: "The copyright year is out of date",
        impact: "An old year in the footer makes the site look abandoned",
        location: { url: page.path, ...(source ?? {}) },
        evidence: `Footer says "${m[0]}" — it's ${year}`,
        fix: "Make the year update itself, so it never goes stale again",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
