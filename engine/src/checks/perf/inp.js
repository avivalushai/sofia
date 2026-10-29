import { DEV_SERVER_SKIP, onDevServer } from "../../lib/dev-server.js";
import { onSlowPhone } from "../../lib/throttle.js";

const SLOW_MS = 200;
const MAX_CLICKS = 6;

/** @type {import("../../types.js").Check} */
export default {
  id: "perf.inp",
  layer: "browser",
  async run(ctx) {
    if (onDevServer(ctx)) return [ctx.skip(DEV_SERVER_SKIP)];
    const results = [];
    for (const page of (await ctx.crawl.browserPages()).slice(0, 3)) {
      const m = await onSlowPhone(ctx.browser, page.url, async (p) => {
        await p.waitForTimeout(1500);
        // controls that change the page without leaving it or sending anything
        const targets = await p.evaluate((max) => [...document.querySelectorAll('button[type="button"], summary, [role="tab"], [aria-expanded], [role="button"]:not(a)')]
          .filter((el) => window.__lc.isVisible(el) && !el.closest("form"))
          .slice(0, max)
          .map((el) => ({ selector: window.__lc.cssPath(el), label: (el.innerText || el.getAttribute("aria-label") || el.localName).trim().slice(0, 30) })), MAX_CLICKS);
        const slow = [];
        for (const t of targets) {
          await p.evaluate(() => (window.__lcEvents = []));
          await p.locator(t.selector).first().click({ timeout: 3000, noWaitAfter: true }).catch(() => {});
          // Chrome reports the timing after the next frame, which a slow phone takes a while to draw
          await p.waitForTimeout(1200);
          const worst = await p.evaluate(() => Math.max(0, ...window.__lcEvents));
          if (worst > SLOW_MS) slow.push({ ...t, ms: Math.round(worst) });
          await p.keyboard.press("Escape").catch(() => {});
        }
        return { tried: targets.length, slow };
      }, {
        beforeGoto: (p) => p.addInitScript(() => {
          window.__lcEvents = [];
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) if (["pointerdown", "pointerup", "click", "keydown"].includes(e.name)) window.__lcEvents.push(e.duration);
          }).observe({ type: "event", durationThreshold: 16, buffered: true });
        }),
      });
      if (!m.slow.length) continue;
      const worst = m.slow.sort((a, b) => b.ms - a.ms)[0];
      results.push(ctx.fail({
        key: page.path,
        title: "The page reacts slowly to taps",
        impact: "After a tap nothing seems to happen for a moment, so people tap again or think the button is broken",
        location: { url: page.path, viewport: 390, selector: worst.selector },
        evidence: m.slow.slice(0, 3).map((s) => `"${s.label}" took ${s.ms}ms to respond`).join("; ") + ` on a mid-range phone (good is under ${SLOW_MS}ms)`,
        fix: "Do less work right after a tap: show the response first and do the heavy part afterwards (or in smaller pieces), and avoid re-drawing the whole page for a small change",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
