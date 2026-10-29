import { fixedElements } from "../../lib/fixed.js";

/**
 * Runs in the page, scrolled to the very top and then the very bottom: a link or button that sits
 * under a floating element at either end can never be uncovered, because the page can't scroll further.
 */
async function coveredAtEnds(fixedElements) {
  const doc = document.scrollingElement || document.documentElement;
  const found = new Map();
  for (const y of [0, doc.scrollHeight]) {
    window.scrollTo(0, y);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const floating = fixedElements().filter((f) => f.position === "fixed" || f.top <= 1 || f.bottom >= window.innerHeight - 1);
    if (!floating.length) continue;
    const roots = floating.map((f) => document.querySelector(f.selector)).filter(Boolean);
    for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button]")) {
      if (roots.some((r) => r.contains(el)) || !window.__lc.isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.width < 4 || r.height < 4) continue;
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
      const top = document.elementFromPoint(cx, cy);
      const cover = top && roots.find((root) => root.contains(top));
      if (cover && !el.contains(top)) {
        const label = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.tagName).trim().slice(0, 40);
        found.set(window.__lc.cssPath(el), { label, by: window.__lc.cssPath(cover), at: y === 0 ? "top" : "bottom" });
      }
    }
  }
  window.scrollTo(0, 0);
  return [...found].map(([selector, v]) => ({ selector, ...v }));
}

/** @type {import("../../types.js").Check} */
export default {
  id: "resp.fixed-overlap",
  layer: "browser",
  async run(ctx) {
    const results = [];
    const width = ctx.viewports.mobile[0];
    for (const page of await ctx.crawl.browserPages()) {
      // scrolls the page: its own copy, so other checks see it untouched
      const covered = await ctx.browser.fresh(page.url, { width }, async (p) => {
        const list = await p.page.evaluate(`(${coveredAtEnds})(${fixedElements})`);
        if (!list.length) return { list };
        await p.page.evaluate((y) => window.scrollTo(0, y), list[0].at === "top" ? 0 : 1e7);
        return { list, shot: await p.screenshot({ highlight: list[0].selector }) };
      });
      if (!covered.list.length) continue;
      const first = covered.list[0];
      results.push(ctx.fail({
        key: page.path,
        title: covered.list.length === 1 ? "A floating element covers a link or button on phones" : `A floating element covers ${covered.list.length} links or buttons on phones`,
        impact: "Visitors can't tap what's underneath, even by scrolling, so that link or button is out of reach on a phone",
        location: { url: page.path, viewport: width, selector: first.selector },
        evidence: covered.list.slice(0, 4).map((c) => `"${c.label}" is under ${c.by} at the ${c.at} of the page`).join("; "),
        fix: "Leave room for the floating element (extra space at the bottom or top of the page), or move it so it doesn't sit over content",
        shot: covered.shot,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
