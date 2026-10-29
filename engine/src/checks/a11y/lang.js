/** @type {import("../../types.js").Check} */
export default {
  id: "a11y.lang",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      if (page.lang?.trim()) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "The page doesn't say what language it's in",
        impact: "Screen readers read it with the wrong accent, and browsers may offer to translate it for no reason",
        location: { url: page.path, file: await ctx.pageSource(page) },
        evidence: "The <html> tag has no lang attribute",
        fix: `Add the language to the <html> tag, for example <html lang="${ctx.detected.he?.value ? "he" : "en"}">`,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
