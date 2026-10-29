/** How much of the screen Safari's bottom bar covers on an iPhone when a page first opens. */
const BAR = 80;

/**
 * Runs in the page: sections sized to the full screen height with 100vh (or Tailwind's h-screen),
 * which on iPhone is taller than what's visible, with something to read or tap in the part that ends
 * up under Safari's bar.
 */
function measure(bar) {
  const vhSelectors = [];
  const walk = (rules) => {
    for (const r of rules) {
      if (r.cssRules && !r.selectorText) walk(r.cssRules);
      else if (r.selectorText && r.style && /(^|\s)100vh/.test(`${r.style.height} ${r.style.minHeight}`)) vhSelectors.push(r.selectorText);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {} // another site's stylesheet: can't read it
  }
  const candidates = new Set();
  for (const sel of vhSelectors) for (const el of document.querySelectorAll(sel)) candidates.add(el);
  for (const el of document.querySelectorAll(".h-screen, .min-h-screen, [style*='100vh']")) candidates.add(el);
  const out = [];
  for (const el of candidates) {
    if (!window.__lc.isVisible(el)) continue;
    const box = el.getBoundingClientRect();
    if (Math.abs(box.height - window.innerHeight) > 2 || box.top > 2) continue; // only the section people see first
    const cut = box.bottom - bar;
    const hidden = [...el.querySelectorAll("a[href], button, input, h1, h2, p, [role=button]")].filter((c) => {
      if (!window.__lc.isVisible(c)) return false;
      const r = c.getBoundingClientRect();
      return r.bottom > cut && r.top < box.bottom;
    });
    if (hidden.length) out.push({ selector: window.__lc.cssPath(el), items: hidden.slice(0, 3).map((c) => (c.innerText || c.tagName).trim().slice(0, 40)), what: hidden[0] && window.__lc.cssPath(hidden[0]) });
  }
  return out;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "resp.safari-ios",
  layer: "browser",
  async run(ctx) {
    const results = [];
    const width = ctx.viewports.mobile[1] ?? ctx.viewports.mobile[0];
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width });
      const found = await p.evaluate(measure, BAR);
      if (!found.length) continue;
      const f = found[0];
      const source = await ctx.guessSource("100vh", page) ?? await ctx.guessSource("h-screen", page);
      results.push(ctx.fail({
        key: page.path,
        title: "On iPhones, the bottom of the first screen hides under Safari's bar",
        impact: `The section is sized to "full screen height", which on iPhone is taller than what's visible, so ${f.items.map((i) => `"${i}"`).join(", ")} sits under the browser bar when the page opens`,
        location: { url: page.path, viewport: width, selector: f.what ?? f.selector, ...(source ?? {}) },
        evidence: `${f.selector} is exactly the screen's height (100vh) and has ${f.items.length} item(s) in its bottom ${BAR}px`,
        fix: "Use 100svh (or 100dvh) instead of 100vh — Tailwind: h-svh / min-h-svh instead of h-screen — so the section fits the part of the screen people actually see",
        shot: await p.screenshot({ highlight: f.what ?? f.selector }),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
