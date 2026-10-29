const PAGEVIEW = [
  { name: "Google Analytics", re: /\/g\/collect\?.*\ben=page_view\b/, id: (u) => new URL(u).searchParams.get("tid") },
  { name: "Plausible", re: /plausible\.io\/api\/event/, id: () => "plausible" },
  { name: "PostHog", re: /i\.posthog\.com\/e|app\.posthog\.com\/e/, id: () => "posthog" },
  { name: "Meta Pixel", re: /facebook\.com\/tr\/?\?.*\bev=PageView\b/, id: (u) => new URL(u).searchParams.get("id") },
  { name: "TikTok Pixel", re: /analytics\.tiktok\.com\/api\/v2\/pixel.*page/i, id: () => "tiktok" },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "analytics.double-fire",
  layer: "browser",
  async run(ctx) {
    const pages = (await ctx.crawl.browserPages()).slice(0, 3);
    const doubled = [];
    for (const page of pages) {
      const counts = await ctx.browser.fresh(page.url, { width: 1280 }, async (p) => {
        await p.page.waitForTimeout(2500);
        const c = new Map();
        for (const r of p.log.requests) {
          const t = PAGEVIEW.find((x) => x.re.test(r.url));
          if (!t) continue;
          const key = `${t.name}${t.id(r.url) ? ` (${t.id(r.url)})` : ""}`;
          c.set(key, (c.get(key) ?? 0) + 1);
        }
        return [...c];
      });
      for (const [tool, n] of counts) if (n > 1) doubled.push({ path: page.path, tool, n });
    }
    if (!doubled.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "Every visit is counted twice",
      impact: "Page views, visitors and conversions show double, so the numbers you base decisions (and ad spend) on are wrong",
      location: { url: doubled[0].path, viewport: 1280 },
      evidence: doubled.slice(0, 4).map((d) => `${d.tool} sent ${d.n} page views for one load of ${d.path}`).join("; "),
      fix: "Load each analytics tag once: usually it's both in the page's <head> and added again through Google Tag Manager or a framework plugin, or a React effect that runs twice; remove one of them",
    })];
  },
};
