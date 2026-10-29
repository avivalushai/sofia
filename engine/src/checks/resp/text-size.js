/** Runs in the page: how much of the visible text is drawn too small to read on a phone. */
function measure() {
  // without a mobile viewport tag the page is drawn wide and shrunk to fit
  const scale = Math.min(1, window.visualViewport?.scale ?? 1);
  let total = 0;
  const small = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.replace(/\s+/g, " ").trim();
    const el = n.parentElement;
    if (text.length < 2 || !el || !window.__lc.isVisible(el) || /^(SUP|SUB|SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize) * scale;
    total += text.length;
    if (px < 12) small.push({ selector: window.__lc.cssPath(el), px: Math.round(px * 10) / 10, chars: text.length, sample: text.slice(0, 50) });
  }
  const smallChars = small.reduce((s, x) => s + x.chars, 0);
  return { total, smallChars, small: small.sort((a, b) => b.chars - a.chars).slice(0, 5), scale };
}

/** @type {import("../../types.js").Check} */
export default {
  id: "resp.text-size",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: ctx.viewports.mobile[0] });
      const m = await p.evaluate(measure);
      if (!m.total) continue;
      // a line of fine print is fine; a paragraph, or a tenth of the page, is not
      const share = m.smallChars / m.total;
      const block = m.small.find((s) => s.chars >= 80);
      if (share < 0.1 && !block) continue;
      const worst = block ?? m.small[0];
      results.push(ctx.fail({
        key: page.path,
        title: "Some text is too small to read on a phone",
        impact: "People have to pinch and zoom to read it, and many just won't: they skip the text or leave",
        location: { url: page.path, viewport: ctx.viewports.mobile[0], selector: worst.selector },
        evidence: `${Math.round(share * 100)}% of the text is under 12px on a phone; for example "${worst.sample}" at ${worst.px}px${m.scale < 1 ? " (the page is shrunk to fit: no mobile viewport tag)" : ""}`,
        fix: "Use at least 16px for body text and 12px for the smallest labels on phones",
        shot: await p.screenshot({ highlight: worst.selector }),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
