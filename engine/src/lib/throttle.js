import { PAGE_HELPERS } from "./page-helpers.js";

/** "Slow 4G" as Chrome DevTools defines it, and a mid-range phone's CPU. */
export const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

/**
 * A fresh phone-sized page on a slow connection and a slow CPU, closed when fn returns.
 * @template T
 * @param {(page: any, cdp: any) => Promise<T>} fn
 */
export async function onSlowPhone(browser, url, fn, { beforeGoto } = {}) {
  const context = await browser.newContext(390);
  try {
    const page = await context.newPage();
    // the same helpers (window.__lc) the other browser checks rely on
    await page.addInitScript(PAGE_HELPERS);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    if (beforeGoto) await beforeGoto(page, cdp);
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    return await fn(page, cdp);
  } finally {
    await context.close().catch(() => {});
  }
}
