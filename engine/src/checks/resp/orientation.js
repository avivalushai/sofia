import { fixedElements } from "../../lib/fixed.js";

const LANDSCAPE = { width: 844, height: 390 };

/** Runs in the page, on a phone turned sideways. */
function measure(fixedElements) {
  const doc = document.scrollingElement || document.documentElement;
  const sideways = doc.scrollWidth > doc.clientWidth + 1 ? doc.scrollWidth - doc.clientWidth : 0;
  const floating = fixedElements();
  // what the floating bars leave for the page itself, top and bottom combined
  const rows = new Set();
  for (const f of floating) for (let y = Math.max(0, Math.floor(f.top)); y < Math.min(window.innerHeight, Math.ceil(f.bottom)); y++) if (f.width >= window.innerWidth * 0.6) rows.add(y);
  const rotate = /rotate (your )?(device|phone|screen)|portrait mode|סובב(ו)? את (המכשיר|הטלפון|המסך)/i.test(document.body.innerText || "");
  return { sideways, covered: rows.size / window.innerHeight, bars: floating.filter((f) => f.width >= window.innerWidth * 0.6).map((f) => f.selector), rotate };
}

/** @type {import("../../types.js").Check} */
export default {
  id: "resp.orientation",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      const r = await ctx.browser.fresh(page.url, { width: LANDSCAPE.width, context: { viewport: LANDSCAPE, isMobile: true, hasTouch: true } }, async (p) => {
        const m = await p.page.evaluate(`(${measure})(${fixedElements})`);
        const bad = m.rotate || m.sideways > 0 || m.covered > 0.4;
        return { m, shot: bad ? await p.screenshot({ highlight: m.bars[0] ?? null }) : null };
      });
      const { m } = r;
      const problems = [
        m.rotate && "the page asks people to turn their phone back",
        m.sideways > 0 && `the page scrolls sideways by ${m.sideways}px`,
        m.covered > 0.4 && `floating bars (${m.bars.slice(0, 2).join(", ")}) take ${Math.round(m.covered * 100)}% of the screen height`,
      ].filter(Boolean);
      if (!problems.length) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "The page doesn't work well with the phone turned sideways",
        impact: m.covered > 0.4
          ? "People watching a video, typing, or simply holding the phone sideways see only a thin strip of the page between the bars"
          : "People who hold their phone sideways get a broken or cut-off page",
        location: { url: page.path, viewport: LANDSCAPE.width, ...(m.bars[0] ? { selector: m.bars[0] } : {}) },
        evidence: `On a phone in landscape (${LANDSCAPE.width}×${LANDSCAPE.height}): ${problems.join("; ")}`,
        fix: m.covered > 0.4 ? "Make the bars smaller in landscape, or let them scroll away (for example position: static under a max-height: 500px media query)" : "Let the layout adapt to a wide, short screen instead of blocking it",
        shot: r.shot,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
