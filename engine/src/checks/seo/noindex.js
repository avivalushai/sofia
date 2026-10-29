/** @type {import("../../types.js").Check} */
export default {
  id: "seo.noindex",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      const metaValue = [page.meta("robots"), page.meta("googlebot")].filter(Boolean).join(", ");
      const header = page.headers["x-robots-tag"] ?? "";
      const inMeta = /noindex|\bnone\b/i.test(metaValue);
      const inHeader = /noindex|\bnone\b/i.test(header);
      if (!inMeta && !inHeader) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "The page is hidden from Google",
        impact: "Search engines are told to leave this page out, so nobody finds it by searching",
        location: { url: page.path, file: inMeta ? await ctx.pageSource(page) : null },
        evidence: inMeta ? `<meta name="robots" content="${metaValue}">` : `X-Robots-Tag header: ${header}`,
        fix: inMeta ? "Remove the noindex robots tag from the page" : "Remove the X-Robots-Tag: noindex header from your host settings",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
