const SLOW_MS = 4000;
const RUNS = 3;
/** "Slow 4G" as Chrome DevTools defines it */
const NETWORK = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

async function measure(browser, url) {
  const context = await browser.newContext(390);
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", NETWORK);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(1000);
    // LCP is final once the visitor interacts; simulate that so the number settles
    await page.mouse.move(1, 1);
    return await page.evaluate(() => window.__lcp);
  } finally {
    await context.close().catch(() => {});
  }
}

/** @type {import("../../types.js").Check} */
export default {
  id: "perf.lcp",
  layer: "browser",
  async run(ctx) {
    const pages = (await ctx.crawl.browserPages()).slice(0, 3);
    const results = [];
    for (const page of pages) {
      const times = [];
      for (let i = 0; i < RUNS; i++) times.push(await measure(ctx.browser, page.url));
      const median = times.sort((a, b) => a - b)[Math.floor(RUNS / 2)];
      if (!median) {
        results.push(ctx.uncertain({ key: page.path, title: "Couldn't measure how fast the page shows", evidence: "Chrome reported no main content paint", location: { url: page.path, viewport: 390 } }));
        continue;
      }
      if (median <= SLOW_MS) continue;
      results.push(ctx.fail({
        key: page.path,
        title: `The main content takes ${(median / 1000).toFixed(1)} seconds to show on a phone`,
        impact: "On a phone connection visitors stare at a half-empty page; many leave before it finishes",
        location: { url: page.path, viewport: 390 },
        evidence: `Time until the main content shows: ${(median / 1000).toFixed(1)}s on a mid-range phone over 4G (median of ${RUNS}; good is under 2.5s, slow over ${SLOW_MS / 1000}s)`,
        fix: "Shrink the biggest image or font above the fold, load it first, and delay scripts that aren't needed straight away",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
