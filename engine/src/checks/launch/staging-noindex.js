/** Preview and staging addresses that hosts give every deployment. */
const PREVIEW = /\.vercel\.app$|\.netlify\.app$|\.pages\.dev$|\.onrender\.com$|\.fly\.dev$|\.up\.railway\.app$|\.herokuapp\.com$|\.web\.app$|\.firebaseapp\.com$|\.amplifyapp\.com$|^(staging|stage|dev|preview|test|qa)[.-]/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "launch.staging-noindex",
  layer: "mechanical",
  async run(ctx) {
    // only a preview address can be checked: how the host treats previews isn't visible from the real domain
    if (ctx.isLocalTarget || !PREVIEW.test(ctx.targetUrl.hostname)) return [ctx.skip("checked when you scan a preview or staging address")];
    const res = await ctx.http.get(ctx.target).catch(() => null);
    if (!res || res.blocked) return [ctx.uncertain({ key: "site", title: "Couldn't read the preview's headers", evidence: res ? "the host's bot protection answered instead of the site" : "the address didn't answer" })];
    const [home] = await ctx.crawl.pages();
    if (/noindex/i.test(res.headers["x-robots-tag"] ?? "") || /noindex/i.test(home?.meta("robots") ?? "")) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "This preview address can show up on Google",
      impact: "A test copy with unfinished content or test data can appear in search next to the real site, and even outrank it",
      location: { url: "/" },
      evidence: `${ctx.targetUrl.hostname} sends no noindex header or meta tag`,
      fix: "Send X-Robots-Tag: noindex on every deployment that isn't production (or put previews behind a password); keep it off the real domain",
    })];
  },
};
