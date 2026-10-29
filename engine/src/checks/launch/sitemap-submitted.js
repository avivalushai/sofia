import { guide } from "../../lib/guided.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "launch.sitemap-submitted",
  layer: "mechanical",
  async run(ctx) {
    // a Search Console verification tag means the site is (at least) set up there
    const verified = (await ctx.crawl.pages()).some((p) => p.meta("google-site-verification") || p.meta("msvalidate.01"));
    let dns = false;
    if (!ctx.isLocalTarget) dns = (await ctx.dns.txt(ctx.targetUrl.hostname.replace(/^www\./, "")).catch(() => [])).some((t) => /google-site-verification/.test(t));
    if (verified || dns) return [ctx.pass()];
    return [guide(ctx, {
      title: "Tell Google about the site",
      evidence: "submitting a sitemap happens in Google Search Console, which can't be seen from outside; no verification tag was found on the site",
      steps: [
        "Go to search.google.com/search-console and add the site as a Domain property",
        "Verify it with the DNS record Google gives you (I can add it if your DNS is in code, or tell you where to paste it)",
        "Under Sitemaps, submit https://your-domain/sitemap.xml",
        "Optional: do the same in Bing Webmaster Tools (it can import from Google in one click)",
      ],
    })];
  },
};
