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
        // the cause, which doesn't depend on timing: images, videos and frames near the top with no space
        // reserved, so whatever is below them moves when they arrive
        const unsized = await p.evaluate(() => [...document.querySelectorAll("img, video, iframe")].filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.top > window.innerHeight * 1.5 || r.height < 80 || !window.__lc.isVisible(el)) return false;
          const s = getComputedStyle(el);
          const reserved = (el.getAttribute("width") && el.getAttribute("height")) || (s.aspectRatio && s.aspectRatio !== "auto") || /px|vh|rem|em/.test(el.style.height) || el.closest("[style*='aspect-ratio'], [style*='height']");
          return !reserved;
        }).map((el) => window.__lc.cssPath(el)));
        return { ...(await p.evaluate(() => window.__cls)), unsized };
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
      if (!m || (m.score <= POOR && !m.unsized.length)) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "The page jumps around while it loads",
        impact: "Text and buttons move just as people start to read or tap, so they lose their place or tap the wrong thing",
        location: { url: page.path, viewport: 390, ...((m.unsized[0] ?? m.sources[0]) ? { selector: m.unsized[0] ?? m.sources[0] } : {}) },
        evidence: [
          m.unsized.length && `${m.unsized.slice(0, 3).join(", ")} ${m.unsized.length === 1 ? "has" : "have"} no width and height, so the content below moves when ${m.unsized.length === 1 ? "it arrives" : "they arrive"}`,
          m.score > 0.01 && `measured layout shift ${m.score.toFixed(2)} on a phone over 4G (good is under 0.1)${m.sources.length ? `; moved: ${m.sources.join(", ")}` : ""}`,
        ].filter(Boolean).join("; "),
        fix: "Reserve space for things that load late: width and height on images and videos, a fixed height for ads, embeds and banners, and font-display: optional or matched fallback fonts",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
