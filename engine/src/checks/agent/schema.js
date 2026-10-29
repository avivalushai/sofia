import { all, attr } from "../../lib/html.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "agent.schema",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    const home = pages[0];
    if (!home) return [ctx.pass()];
    const results = [];
    let any = false;
    for (const page of pages) {
      for (const s of all(page.doc, "script").filter((x) => (attr(x, "type") ?? "").toLowerCase() === "application/ld+json")) {
        any = true;
        const text = s.children?.map((c) => c.data ?? "").join("") ?? "";
        try {
          JSON.parse(text);
        } catch (e) {
          results.push(ctx.fail({
            key: `invalid:${page.path}`,
            title: "The page's structured description is broken",
            impact: "Google and AI assistants ignore structured data they can't read, so the page loses rich results (stars, prices, opening hours)",
            location: { url: page.path, file: await ctx.pageSource(page) },
            evidence: `the JSON-LD block doesn't parse: ${e.message.slice(0, 80)}`,
            fix: "Fix the JSON in the <script type=\"application/ld+json\"> block (a validator such as Google's Rich Results Test points to the error)",
          }));
        }
      }
      if (/\sitemscope[\s>=]/i.test(page.html)) any = true;
    }
    // client-side injected data counts too, once the page has run
    if (!any && ctx.browser) {
      const p = await ctx.browser.open(home.url, { width: 1280 });
      any = await p.evaluate(() => Boolean(document.querySelector('script[type="application/ld+json"], [itemscope]')));
    }
    if (!any) {
      results.push(ctx.fail({
        key: "site",
        title: "The site doesn't describe itself in a way machines can read",
        impact: "Google can't show rich results (ratings, prices, business hours), and AI assistants have to guess what the business is, what it sells and where",
        location: { url: home.path, file: await ctx.pageSource(home) },
        evidence: "no JSON-LD or microdata on any scanned page",
        fix: "Add a JSON-LD block to the home page describing the business (Organization or LocalBusiness), and Product or Article on those pages",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
