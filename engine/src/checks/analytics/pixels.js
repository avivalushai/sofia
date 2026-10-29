const PIXELS = [
  { name: "Meta Pixel", script: /connect\.facebook\.net\/.+\/fbevents\.js/, hit: /facebook\.com\/tr\/?\?/ },
  { name: "TikTok Pixel", script: /analytics\.tiktok\.com\/i18n\/pixel/, hit: /analytics\.tiktok\.com\/api\/v2\/pixel/ },
  { name: "Google Ads", script: /googletagmanager\.com\/gtag\/js\?id=AW-/, hit: /googleadservices\.com\/pagead\/conversion|google\.com\/pagead\/1p-user-list|\/pagead\/viewthroughconversion/ },
  { name: "LinkedIn Insight", script: /snap\.licdn\.com\/li\.lms-analytics/, hit: /px\.ads\.linkedin\.com/ },
  { name: "Snap Pixel", script: /sc-static\.net\/scevent\.min\.js/, hit: /tr\.snapchat\.com/ },
  { name: "Taboola", script: /cdn\.taboola\.com\/libtrc\/unip/, hit: /trc\.taboola\.com/ },
  { name: "Outbrain", script: /amplify\.outbrain\.com\/cp\/obtp\.js/, hit: /tr\.outbrain\.com/ },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "analytics.pixels",
  layer: "browser",
  async run(ctx) {
    const [home] = await ctx.crawl.browserPages();
    if (!home) return [ctx.pass()];
    const seen = await ctx.browser.fresh(home.url, { width: 1280 }, async (p) => {
      const accept = p.page.getByRole("button", { name: /^(accept( all)?|allow( all)?|agree|ok|got it|אישור|מאשר|קבל|הסכמה|הבנתי)$/i }).first();
      if (await accept.isVisible().catch(() => false)) await accept.click({ timeout: 2000 }).catch(() => {});
      await p.page.waitForTimeout(3000);
      return { urls: p.log.requests.map((r) => r.url), failed: p.log.failed.map((f) => f.url) };
    });
    const loaded = PIXELS.filter((x) => seen.urls.some((u) => x.script.test(u)));
    // the code mentions pixels that never load (a broken ID, a consent setting that never opens)
    const inCode = [];
    for (const f of ctx.project.shippedSource()) {
      const t = (await ctx.project.read(f)) ?? "";
      if (/fbq\(|fbevents\.js/.test(t)) inCode.push("Meta Pixel");
      if (/ttq\.|tiktok.*pixel/i.test(t)) inCode.push("TikTok Pixel");
    }
    const problems = [];
    for (const x of loaded) if (!seen.urls.some((u) => x.hit.test(u)) || seen.failed.some((u) => x.hit.test(u))) problems.push(`${x.name} loads but sends no events`);
    for (const name of new Set(inCode)) if (!loaded.some((x) => x.name === name)) problems.push(`${name} is in the code but never loads`);
    if (!problems.length) {
      if (loaded.length) return [ctx.pass()];
      return [ctx.uncertain({ key: "site", title: "Couldn't find the ad pixels", evidence: "the site uses ads, but no ad pixel loaded on the home page (it may load only on some pages or after a step)" })];
    }
    return [ctx.fail({
      key: "site",
      title: "Ad pixels aren't reporting",
      impact: "The ad platforms can't see visits and conversions, so they optimise blind, you can't measure what the ads bring, and retargeting audiences stay empty",
      location: { url: home.path, viewport: 1280 },
      evidence: problems.join("; "),
      fix: "Check each pixel's ID in the ad platform, that it starts after cookie consent (not never), and use the platform's test tool (Meta Events Manager → Test events, TikTok Pixel Helper) to see events arrive",
    })];
  },
};
