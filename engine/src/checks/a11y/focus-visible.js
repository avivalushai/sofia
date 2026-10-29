const MAX = 25;

function look(el) {
  const s = getComputedStyle(el);
  return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.borderWidth, s.backgroundColor, s.color, s.textDecorationLine].join("|");
}

/** @type {import("../../types.js").Check} */
export default {
  id: "a11y.focus-visible",
  layer: "browser",
  async run(ctx) {
    const bad = [];
    for (const page of await ctx.crawl.browserPages()) {
      const found = await ctx.browser.fresh(page.url, { width: 1280 }, async (p) => {
        // how every control looks before it gets focus
        await p.page.evaluate(`(() => { const look = ${look}; window.__lcLook = new Map([...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].map((el) => [el, look(el)])); })()`);
        await p.page.mouse.click(1, 1).catch(() => {});
        const count = await p.page.evaluate(() => window.__lcLook.size);
        const out = [];
        const seen = new Set();
        for (let i = 0; i < Math.min(MAX, count + 1); i++) {
          await p.page.keyboard.press("Tab");
          // focus styles with a transition need a moment to show
          await p.page.waitForTimeout(await p.page.evaluate(() => Math.min(250, parseFloat(getComputedStyle(document.activeElement ?? document.body).transitionDuration) * 1000 || 0)));
          const r = await p.page.evaluate(`(() => { const look = ${look}; const el = document.activeElement; if (!el || el === document.body || !window.__lcLook.has(el)) return null; return { selector: window.__lc.cssPath(el), same: window.__lcLook.get(el) === look(el), label: (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.localName).trim().slice(0, 30) }; })()`);
          if (!r || seen.has(r.selector)) continue;
          seen.add(r.selector);
          if (r.same) out.push(r);
        }
        return { out, shot: out.length ? await p.page.locator(out[0].selector).first().focus().then(() => p.screenshot({ highlight: null })).catch(() => null) : null };
      });
      if (found.out.length) bad.push({ path: page.path, ...found });
    }
    if (!bad.length) return [ctx.pass()];
    const total = bad.reduce((n, b) => n + b.out.length, 0);
    return [ctx.fail({
      key: "site",
      title: total === 1 ? "A control shows no sign when it has keyboard focus" : `${total} controls show no sign when they have keyboard focus`,
      impact: "People using the keyboard can't see where they are on the page, so they press Enter on the wrong thing or give up",
      location: { url: bad[0].path, viewport: 1280, selector: bad[0].out[0].selector },
      evidence: bad.flatMap((b) => b.out.map((o) => `"${o.label}" on ${b.path}`)).slice(0, 6).join(", ") + " look exactly the same when focused",
      fix: "Don't remove the focus outline (outline: none) without a replacement; add a clear :focus-visible style, for example a 2px outline in the brand colour",
      shot: bad[0].shot,
    })];
  },
};
