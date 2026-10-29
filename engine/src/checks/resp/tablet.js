/** Runs in the page: sideways scrolling, and links or buttons drawn on top of each other. */
function measure() {
  const doc = document.scrollingElement || document.documentElement;
  const sideways = doc.scrollWidth > doc.clientWidth + 1 ? doc.scrollWidth - doc.clientWidth : 0;
  const floats = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) if (/fixed|sticky/.test(getComputedStyle(a).position)) return true;
    return false;
  };
  const items = [...document.querySelectorAll("a[href], button, [role=button], input:not([type=hidden]), select")]
    // floating elements pass over content as the page scrolls: that's resp.fixed-overlap's job
    .filter((el) => window.__lc.isVisible(el) && !floats(el))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 4 && r.height > 4);
  const overlaps = [];
  for (let i = 0; i < items.length && overlaps.length < 5; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w <= 0 || h <= 0) continue;
      const smaller = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
      if ((w * h) / smaller < 0.3) continue;
      const label = (el) => (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30);
      overlaps.push({ a: label(a.el), b: label(b.el), selector: window.__lc.cssPath(a.el) });
      break;
    }
  }
  return { sideways, overlaps };
}

/** @type {import("../../types.js").Check} */
export default {
  id: "resp.tablet",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      for (const width of [768, 1024]) {
        const p = await ctx.browser.open(page.url, { width });
        const m = await p.evaluate(measure);
        // sideways scrolling at 768 is already reported by resp.no-horizontal-scroll
        const sideways = width === 1024 && m.sideways > 0;
        if (!sideways && !m.overlaps.length) continue;
        results.push(ctx.fail({
          key: `${page.path}_${width}`,
          title: m.overlaps.length ? `Links or buttons sit on top of each other on tablets` : "The page scrolls sideways on large tablets",
          impact: m.overlaps.length
            ? "On an iPad, people tap one thing and get another, or can't read the labels"
            : "On an iPad held sideways the page drags left and right, and content at the edge is cut off",
          location: { url: page.path, viewport: width, ...(m.overlaps[0] ? { selector: m.overlaps[0].selector } : {}) },
          evidence: [
            ...m.overlaps.slice(0, 3).map((o) => `"${o.a}" overlaps "${o.b}"`),
            sideways && `the page is ${m.sideways}px wider than the ${width}px screen`,
          ].filter(Boolean).join("; ") + ` (at ${width}px)`,
          fix: m.overlaps.length ? "Let the menu wrap or switch to the mobile menu at this width, and give items room so they don't overlap" : "Make the widest element shrink or wrap at tablet widths",
          shot: await p.screenshot({ highlight: m.overlaps[0]?.selector ?? null }),
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
