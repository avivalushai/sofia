const MIN = 44;

/** Buttons and button-like links that are too small to tap. Links inside running text are exempt (WCAG). */
function smallTargets(min) {
  const looksLikeButton = (el) => {
    const s = getComputedStyle(el);
    const filled = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
    const bordered = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none";
    return s.display !== "inline" && (filled || bordered || parseFloat(s.paddingTop) >= 8);
  };
  return [...document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[href]')]
    .filter((el) => window.__lc.isVisible(el))
    .filter((el) => el.localName !== "a" || looksLikeButton(el))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { selector: window.__lc.cssPath(el), w: Math.round(r.width), h: Math.round(r.height), text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 30) };
    })
    .filter((t) => t.h < min || t.w < min);
}

/** @type {import("../../types.js").Check} */
export default {
  id: "resp.touch-targets",
  layer: "browser",
  async run(ctx) {
    const results = [];
    const width = ctx.viewports.mobile[0];
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width });
      const small = await p.evaluate(smallTargets, MIN);
      if (!small.length) continue;
      const first = small[0];
      results.push(ctx.fail({
        key: page.path,
        title: small.length === 1 ? "A button is too small to tap easily" : `${small.length} buttons are too small to tap easily`,
        impact: "On a phone people miss the button or hit the one next to it, and give up",
        location: { url: page.path, viewport: width, selector: first.selector },
        evidence: small.slice(0, 4).map((s) => `${s.text ? `"${s.text}"` : s.selector} is ${s.w}×${s.h}px`).join("; ") + ` (minimum ${MIN}×${MIN}px)`,
        fix: `Give each button at least ${MIN}px of height and width on phones, with some space between them`,
        shot: await p.screenshot({ highlight: first.selector }),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
