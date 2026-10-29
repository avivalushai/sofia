import { onSlowPhone } from "../../lib/throttle.js";

const POOR = 0.1;

/** @type {import("../../types.js").Check} */
export default {
  id: "perf.cls",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of (await ctx.crawl.browserPages()).slice(0, 5)) {
      const m = await onSlowPhone(ctx.browser, page.url, async (p) => {
        await p.waitForTimeout(2500);
        return p.evaluate(() => window.__cls);
      }, {
        beforeGoto: (p) => p.addInitScript(() => {
          // the largest burst of shifts (a "session window"), the way Chrome scores it
          window.__cls = { score: 0, sources: [] };
          let win = 0;
          let start = 0;
          let last = 0;
          let srcs = [];
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              // nothing is clicked or typed during this load, so hadRecentInput is ignored: Chrome sets it
              // under touch emulation even without any input
              if (e.startTime - last > 1000 || e.startTime - start > 5000) {
                win = 0;
                start = e.startTime;
                srcs = [];
              }
              win += e.value;
              last = e.startTime;
              for (const s of e.sources ?? []) if (s.node?.nodeType === 1) srcs.push(s.node);
              if (win <= window.__cls.score) continue;
              // naming the moved element must never stop the score from being recorded
              const name = (n) => {
                try {
                  return window.__lc?.cssPath?.(n) ?? n.localName;
                } catch {
                  return n.localName;
                }
              };
              window.__cls = { score: win, sources: srcs.slice(0, 3).map(name) };
            }
          }).observe({ type: "layout-shift", buffered: true });
        }),
      });
      if (!m || m.score <= POOR) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "The page jumps around while it loads",
        impact: "Text and buttons move just as people start to read or tap, so they lose their place or tap the wrong thing",
        location: { url: page.path, viewport: 390, ...(m.sources[0] ? { selector: m.sources[0] } : {}) },
        evidence: `layout shift score ${m.score.toFixed(2)} on a phone over 4G (good is under 0.1)${m.sources.length ? `; moved: ${m.sources.join(", ")}` : ""}`,
        fix: "Reserve space for things that load late: width and height on images and videos, a fixed height for ads, embeds and banners, and font-display: optional or matched fallback fonts",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
