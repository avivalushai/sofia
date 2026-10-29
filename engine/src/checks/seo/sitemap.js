const MAX_URLS = 40;

/** @type {import("../../types.js").Check} */
export default {
  id: "seo.sitemap",
  layer: "mechanical",
  async run(ctx) {
    const origin = ctx.targetUrl.origin;
    const robots = await ctx.http.get(new URL("/robots.txt", origin).href).catch(() => null);
    const declared = robots?.status === 200 ? [...String(robots.body).matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]) : [];
    // on a local copy, the sitemap lists the live addresses: check the same paths here
    const local = (u) => {
      try {
        const x = new URL(u, origin);
        return new URL(x.pathname + x.search, origin).href;
      } catch {
        return null;
      }
    };
    const candidates = [...new Set([...declared.map(local).filter(Boolean), new URL("/sitemap.xml", origin).href, new URL("/sitemap-index.xml", origin).href, new URL("/sitemap_index.xml", origin).href])];
    let found = null;
    for (const u of candidates) {
      const r = await ctx.http.get(u).catch(() => null);
      if (r?.status === 200 && /<(urlset|sitemapindex)\b/i.test(String(r.body).slice(0, 2000))) {
        found = { url: u, body: String(r.body) };
        break;
      }
    }
    const pages = await ctx.crawl.pages();
    if (!found) {
      // a one-page site has nothing for a sitemap to add
      if (pages.length < 2) return [ctx.pass()];
      return [ctx.fail({
        key: "site",
        title: "The site has no sitemap",
        impact: "Search engines find pages only by following links, so new or less-linked pages can take weeks to appear on Google, or never do",
        location: { url: "/sitemap.xml" },
        evidence: `no sitemap at ${candidates.map((u) => new URL(u).pathname).join(", ")}${declared.length ? "" : ", and robots.txt doesn't name one"}`,
        fix: "Add a sitemap.xml that lists every public page, and name it in robots.txt (Sitemap: https://your-domain/sitemap.xml)",
      })];
    }
    // a sitemap index points to more sitemaps; check the first one
    let body = found.body;
    if (/<sitemapindex\b/i.test(body)) {
      const first = body.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)?.[1];
      const r = first ? await ctx.http.get(local(first)).catch(() => null) : null;
      body = r?.status === 200 ? String(r.body) : "";
    }
    const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).slice(0, MAX_URLS);
    const broken = [];
    for (const loc of locs) {
      const u = local(loc);
      if (!u) continue;
      const r = await ctx.http.get(u, { as: "none" }).catch((e) => ({ status: e.message }));
      if (r.blocked) continue;
      if (typeof r.status !== "number" || r.status >= 400) broken.push(`${new URL(u).pathname} (${r.status})`);
    }
    if (!broken.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: broken.length === 1 ? "The sitemap lists a page that doesn't work" : `The sitemap lists ${broken.length} pages that don't work`,
      impact: "Search engines are sent to broken pages, which wastes their visits to your site and can make the whole sitemap less trusted",
      location: { url: new URL(found.url).pathname, file: ctx.project.files.find((f) => /(^|\/)sitemap[^/]*\.xml$/.test(f)) ?? null },
      evidence: broken.slice(0, 6).join(", ") + (broken.length > 6 ? `, and ${broken.length - 6} more` : ""),
      fix: "Remove the broken addresses from the sitemap, or fix the pages (if the sitemap is generated, regenerate it)",
    })];
  },
};
