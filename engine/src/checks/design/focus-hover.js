const MAX_PER_PAGE = 12;

/** Runs in the page: the look of an element, for comparing before and after the pointer is on it. */
function look(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return [s.backgroundColor, s.color, s.borderColor, s.boxShadow, s.textDecorationLine, s.opacity, s.transform, s.filter, s.outlineStyle, s.backgroundImage, Math.round(r.width), Math.round(r.height)].join("|");
}

/** Runs in the page: buttons and button-like links (not links inside running text). */
function candidates(max) {
  const seen = new Set();
  return [...document.querySelectorAll('button, [role="button"], input[type="submit"], a[href]')]
    .filter((el) => {
      if (!window.__lc.isVisible(el) || el.disabled) return false;
      const s = getComputedStyle(el);
      if (el.localName === "a" && s.display === "inline" && el.closest("p, li")) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 16 || r.height < 16 || r.top < 0 || r.bottom > window.innerHeight * 3) return false;
      const key = `${el.localName}|${el.className}`;
      if (seen.has(key)) return false; // one of each kind
      seen.add(key);
      return true;
    })
    .slice(0, max)
    .map((el) => ({ selector: window.__lc.cssPath(el), label: (el.innerText || el.value || el.getAttribute("aria-label") || el.localName).trim().slice(0, 30) }));
}

/** @type {import("../../types.js").Check} */
export default {
  id: "design.focus-hover",
  layer: "browser",
  async run(ctx) {
    // keyboard focus is a11y.focus-visible's; this check is about the pointer
    const flat = [];
    for (const page of await ctx.crawl.browserPages()) {
      const dead = await ctx.browser.fresh(page.url, { width: 1280 }, async (p) => {
        const out = [];
        for (const c of await p.evaluate(candidates, MAX_PER_PAGE)) {
          await p.page.mouse.move(0, 0);
          const el = p.page.locator(c.selector).first();
          await el.scrollIntoViewIfNeeded().catch(() => {});
          const before = await p.evaluate(look, c.selector);
          const ok = await el.hover({ timeout: 2000 }).then(() => true, () => false);
          if (!ok) continue;
          await p.page.waitForTimeout(350); // let transitions finish
          const after = await p.evaluate(look, c.selector);
          const cursor = await p.evaluate((sel) => getComputedStyle(document.querySelector(sel)).cursor, c.selector);
          // a hand cursor is feedback too; only an element where nothing at all changes is reported
          if (before && after && before === after && cursor !== "pointer") out.push({ ...c, path: page.path });
        }
        return out;
      });
      flat.push(...dead);
    }
    if (!flat.length) return [ctx.pass()];
    // one finding for the site: it's usually one button style used everywhere
    const pages = [...new Set(flat.map((d) => d.path))];
    return [ctx.fail({
      key: "site",
      title: flat.length === 1 ? "A button doesn't react when the mouse is over it" : `${flat.length} buttons don't react when the mouse is over them`,
      impact: "Without a change on hover, people aren't sure what's clickable, and the page feels static",
      location: { url: flat[0].path, viewport: 1280, selector: flat[0].selector },
      evidence: flat.slice(0, 5).map((d) => `"${d.label}" on ${d.path}`).join(", ") + (flat.length > 5 ? `, and ${flat.length - 5} more` : "") + ` look exactly the same under the mouse, and the cursor doesn't change either (${pages.length} page${pages.length === 1 ? "" : "s"})`,
      fix: "Add a hover style (a slightly darker or lighter background, or a small shadow) and cursor: pointer",
    })];
  },
};
