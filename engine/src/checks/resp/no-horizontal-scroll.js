/** Runs in the page: does it scroll sideways, and which element is to blame? */
function measureOverflow() {
  const doc = document.scrollingElement || document.documentElement;
  const width = doc.clientWidth;
  if (doc.scrollWidth <= width + 1) return null;
  const clipped = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if (o === "hidden" || o === "auto" || o === "scroll" || o === "clip") return true;
    }
    return false;
  };
  // document coordinates, so it doesn't matter where the page is scrolled to; in a right-to-left
  // page the overflow sticks out on the left (negative x)
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left + window.scrollX, right: r.right + window.scrollX, width: r.width };
  };
  const offenders = [...document.body.querySelectorAll("*")].filter((el) => {
    if (!window.__lc.isVisible(el) || clipped(el)) return false;
    const r = box(el);
    return r.right > width + 1 || r.left < -1;
  });
  // the outermost offender: its parent fits
  const outer = offenders.filter((el) => !offenders.includes(el.parentElement));
  if (!outer.length) return { selector: "body", px: doc.scrollWidth - width };
  const worst = outer
    .map((el) => {
      const r = box(el);
      return { el, px: Math.round(Math.max(r.right - width, -r.left)) };
    })
    .sort((a, b) => b.px - a.px)[0];
  return { selector: window.__lc.cssPath(worst.el), px: worst.px, elWidth: Math.round(box(worst.el).width) };
}

/** @type {import("../../types.js").Check} */
export default {
  id: "resp.no-horizontal-scroll",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      for (const width of [...ctx.viewports.mobile, ...ctx.viewports.tablet]) {
        const p = await ctx.browser.open(page.url, { width });
        const overflow = await p.evaluate(measureOverflow);
        if (!overflow) continue;
        const cls = overflow.selector.match(/\.([A-Za-z][\w-]*)/)?.[1];
        const source = cls ? await ctx.guessSource(`.${cls}`) : null;
        results.push(ctx.fail({
          key: `${page.path}_${width}`,
          title: `The page scrolls sideways on ${width < 768 ? "phones" : "tablets"}`,
          impact: `At ${width}px wide the page drags left and right, and content at the edge gets cut off`,
          location: { url: page.path, viewport: width, selector: overflow.selector, ...(source ?? {}) },
          evidence: `${overflow.selector}${overflow.elWidth ? ` is ${overflow.elWidth}px wide and` : ""} sticks out ${overflow.px}px past the ${width}px screen`,
          fix: "Make it fit narrow screens — let it shrink, wrap, or stack its items in one column",
          shot: await p.screenshot({ highlight: overflow.selector }),
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
