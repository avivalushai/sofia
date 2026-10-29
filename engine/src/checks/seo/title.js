/** @type {import("../../types.js").Check} */
export default {
  id: "seo.title",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    const byTitle = new Map();
    for (const p of pages) {
      if (!p.title) continue;
      if (!byTitle.has(p.title)) byTitle.set(p.title, []);
      byTitle.get(p.title).push(p.path);
    }
    const results = [];
    for (const page of pages) {
      const location = { url: page.path, file: await ctx.pageSource(page) };
      if (!page.title) {
        results.push(ctx.fail({
          key: page.path,
          title: "The page has no title",
          impact: "Google and the browser tab show the web address instead of a name, so fewer people click",
          location,
          evidence: "No <title> in the page head",
          fix: "Give the page a short title that says what's on it",
        }));
        continue;
      }
      const same = byTitle.get(page.title);
      if (same.length < 2) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "Several pages have the same title",
        impact: "In Google results and browser tabs these pages look identical, so people can't tell which one they want",
        location,
        evidence: `"${page.title}" is the title of ${same.join(", ")}`,
        fix: "Give each page its own title, for example the page name followed by the site name",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
