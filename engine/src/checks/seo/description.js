const MIN = 50;
const MAX = 160;

/** @type {import("../../types.js").Check} */
export default {
  id: "seo.description",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    const results = [];
    const seen = new Map();
    for (const page of pages) {
      const d = (page.meta("description") ?? "").replace(/\s+/g, " ").trim();
      if (d) seen.set(d, [...(seen.get(d) ?? []), page.path]);
    }
    for (const page of pages) {
      const d = (page.meta("description") ?? "").replace(/\s+/g, " ").trim();
      const shared = d && pages.length > 1 ? seen.get(d).filter((p) => p !== page.path) : [];
      const problem = !d ? "missing" : d.length < MIN ? "short" : d.length > MAX ? "long" : shared.length ? "copy" : null;
      if (!problem) continue;
      results.push(ctx.fail({
        key: page.path,
        title: {
          missing: "This page has no description for search results",
          short: "This page's search description is too short",
          long: "This page's search description gets cut off",
          copy: "This page has the same search description as another page",
        }[problem],
        impact: {
          missing: "Google picks a random sentence from the page to show under the link, which often isn't the one that makes people click",
          short: "A few words under the link in Google don't tell people why to click",
          long: "Google cuts it off after about 160 characters, so the end of the message is lost",
          copy: "In Google the pages look alike, so people can't tell which one they want",
        }[problem],
        location: { url: page.path, file: await ctx.pageSource(page) },
        evidence: !d ? "no <meta name=\"description\">" : problem === "copy" ? `"${d.slice(0, 80)}" is also on ${shared.slice(0, 3).join(", ")}` : `${d.length} characters: "${d.slice(0, 100)}${d.length > 100 ? "…" : ""}"`,
        fix: `Write a description of ${MIN}–${MAX} characters for this page: what it offers and why to click`,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
