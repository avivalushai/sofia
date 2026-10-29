import { PAGE_HELPERS } from "../../lib/page-helpers.js";

// a weak cellular connection (DevTools' "Slow 3G")
const SLOW_3G = { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 };
const WAIT_MS = 3000;

/** @type {import("../../types.js").Check} */
export default {
  id: "behave.slow-network",
  layer: "browser",
  async run(ctx) {
    const [home] = await ctx.crawl.browserPages();
    if (!home) return [ctx.pass()];
    const context = await ctx.browser.newContext(390);
    let seen;
    try {
      const page = await context.newPage();
      await page.addInitScript(PAGE_HELPERS);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", SLOW_3G);
      await page.goto(home.url, { waitUntil: "commit", timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(WAIT_MS);
      // what someone on a weak connection is looking at after three seconds
      seen = await page.evaluate(() => {
        // text faded out or hidden (an "anti-flicker" snippet waiting for scripts) isn't something anyone can read
        const shown = (el) => {
          for (let a = el; a; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (s.opacity === "0" || s.visibility === "hidden" || s.display === "none") return false;
          }
          return true;
        };
        const text = document.body && shown(document.body) ? document.body.innerText.trim() : "";
        // a loading indicator counts only if people can see it (not a class on <html> that hides the page)
        const busy = [...(document.body?.querySelectorAll('[aria-busy="true"], [role="progressbar"], .spinner, .loader, .loading, .skeleton, [class*="skeleton"], [class*="spinner"], [class*="loading"]') ?? [])].some((el) => shown(el) && el.getBoundingClientRect().width > 0);
        return { chars: text.length, busy, sample: text.slice(0, 60) };
      }).catch(() => ({ chars: 0, busy: false, sample: "" }));
      seen.shot = await page.screenshot({ type: "png" }).catch(() => null);
    } finally {
      await context.close().catch(() => {});
    }
    if (seen.chars >= 20 || seen.busy) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "On a weak connection the page stays blank",
      impact: "On a weak cellular signal (a train, a basement, abroad) visitors stare at a white screen with no sign anything is happening, and most leave within a few seconds",
      location: { url: home.path, viewport: 390 },
      evidence: `after ${WAIT_MS / 1000} seconds on a slow 3G connection the page shows ${seen.chars ? `only "${seen.sample}"` : "nothing"}, and no loading indicator`,
      fix: "Send the page's main text in the HTML (or a lightweight loading screen with the logo and a spinner), and load heavy scripts and images after it",
      shot: seen.shot,
    })];
  },
};
