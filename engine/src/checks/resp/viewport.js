/** @type {import("../../types.js").Check} */
export default {
  id: "resp.viewport",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      const content = page.meta("viewport");
      if (content != null && /width\s*=\s*device-width/i.test(content)) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "The page shows as a tiny desktop page on phones",
        impact: "On a phone, visitors see a shrunken desktop layout and have to pinch to read anything",
        location: { url: page.path, file: await ctx.pageSource(page) },
        evidence: content == null ? "No viewport meta tag" : `Viewport meta tag is "${content}" (no width=device-width)`,
        fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the page head',
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
