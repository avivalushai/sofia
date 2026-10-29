import { all, attr } from "../../lib/html.js";

const alternates = (page) =>
  all(page.doc, "link")
    .filter((l) => (attr(l, "rel") ?? "").toLowerCase().split(/\s+/).includes("alternate") && attr(l, "hreflang"))
    .map((l) => ({ lang: attr(l, "hreflang").toLowerCase(), href: attr(l, "href") }));

/** @type {import("../../types.js").Check} */
export default {
  id: "rtl.hreflang",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    const withAlt = pages.filter((p) => alternates(p).length);
    if (!withAlt.length) {
      return [ctx.fail({
        key: "site",
        title: "Search engines aren't told which page is which language",
        impact: "Google may show the English page to Hebrew searchers (or the other way round), or treat the translations as duplicates",
        location: { url: pages[0]?.path ?? "/", file: pages[0] ? await ctx.pageSource(pages[0]) : null },
        evidence: "no <link rel=\"alternate\" hreflang=\"…\"> on any scanned page",
        fix: 'On each page, list every language version, itself included: <link rel="alternate" hreflang="he" href="https://your-domain/page">, the same for "en", plus hreflang="x-default"',
      })];
    }
    // each listed version should list this page back, on the same path the crawler knows
    const byPath = new Map(pages.map((p) => [new URL(p.url).pathname, p]));
    const problems = [];
    for (const page of withAlt) {
      const own = new URL(page.url).pathname;
      const alts = alternates(page);
      const self = alts.some((a) => {
        try {
          return new URL(a.href, page.url).pathname === own;
        } catch {
          return false;
        }
      });
      if (!self) problems.push(`${page.path} doesn't list itself`);
      for (const a of alts) {
        let path;
        try {
          path = new URL(a.href, page.url).pathname;
        } catch {
          problems.push(`${page.path}: "${a.href}" isn't a valid address`);
          continue;
        }
        const other = byPath.get(path);
        if (!other || other === page) continue;
        const back = alternates(other).some((b) => {
          try {
            return new URL(b.href, other.url).pathname === own;
          } catch {
            return false;
          }
        });
        if (!back) problems.push(`${page.path} → ${path} (${a.lang}), but ${path} doesn't point back`);
      }
    }
    if (!problems.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "The language versions don't point to each other properly",
      impact: "Search engines ignore language links that aren't mutual, so searchers may land on the wrong language",
      location: { url: withAlt[0].path, file: await ctx.pageSource(withAlt[0]) },
      evidence: problems.slice(0, 4).join("; "),
      fix: "On every language version, list all versions including itself, with the same set of links on each",
    })];
  },
};
