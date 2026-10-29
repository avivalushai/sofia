import { ANALYTICS_HOSTS, COOKIELESS } from "../../lib/browser-checks.js";

const BEACON = /google-analytics\.com\/(g\/)?collect|analytics\.google\.com\/g\/collect|\/g\/collect\?|plausible\.io\/api\/event|\/api\/event$|i\.posthog\.com\/(e|i\/v0\/e|batch)|app\.posthog\.com\/(e|batch)|api-js\.mixpanel\.com\/track|api2?\.amplitude\.com|api\.segment\.io|vitals\.vercel-insights|\/_vercel\/insights\/view|clarity\.ms\/collect|umami\.is\/api\/send|\/api\/send$|usefathom\.com|cdn\.usefathom\.com|simpleanalytics/;

/** @type {import("../../types.js").Check} */
export default {
  id: "analytics.installed",
  layer: "browser",
  async run(ctx) {
    const [home] = await ctx.crawl.browserPages();
    if (!home) return [ctx.pass()];
    // a fresh visit, accepting cookies if a banner asks, so consent-gated analytics can start
    const seen = await ctx.browser.fresh(home.url, { width: 1280 }, async (p) => {
      const accept = p.page.getByRole("button", { name: /^(accept( all)?|allow( all)?|agree|ok|got it|אישור|מאשר|קבל|הסכמה|הבנתי)$/i }).first();
      if (await accept.isVisible().catch(() => false)) {
        await accept.click({ timeout: 2000 }).catch(() => {});
        await p.page.waitForTimeout(2500);
      }
      return { tools: [...new Set(p.log.requests.map((r) => r.url).filter((u) => ANALYTICS_HOSTS.test(u) || COOKIELESS.test(u)).map((u) => new URL(u).host))], beacons: p.log.requests.filter((r) => BEACON.test(r.url)).map((r) => new URL(r.url).host), failed: p.log.failed.filter((f) => BEACON.test(f.url) || ANALYTICS_HOSTS.test(f.url)).map((f) => new URL(f.url).host) };
    });
    if (seen.beacons.length && !seen.failed.length) return [ctx.pass()];
    // on a local copy, analytics is often switched off on purpose
    const inCode = (await Promise.all(ctx.project.shippedSource().map((f) => ctx.project.read(f)))).some((t) => /gtag\(|googletagmanager|plausible|posthog|@vercel\/analytics|mixpanel|amplitude|umami|fathom/i.test(t ?? ""));
    if (ctx.isLocalTarget && inCode) return [ctx.uncertain({ key: "site", title: "Couldn't confirm analytics works", evidence: "analytics is in the code but sent nothing on this local copy (many setups turn it on only in production); scan the live site to confirm" })];
    return [ctx.fail({
      key: "site",
      title: seen.tools.length ? "Analytics loads but doesn't record visits" : "The site has no analytics",
      impact: "You won't know how many people come, where from, or where they leave, so every decision after launch is a guess",
      location: { url: home.path, viewport: 1280 },
      evidence: seen.tools.length ? `${seen.tools.join(", ")} loaded, but no page-view was sent${seen.failed.length ? ` (failed: ${seen.failed.join(", ")})` : ""}` : "no analytics tool loaded and no page-view was sent on the home page",
      fix: seen.tools.length
        ? "Check the measurement ID or site domain in the analytics setup, and that an ad blocker or consent setting isn't stopping it on every visit"
        : "Pick an analytics tool and add it: Plausible or Vercel Analytics (simple, no cookie banner needed) or Google Analytics 4 (free, needs consent); I'll add the snippet once you've created the account",
    })];
  },
};
