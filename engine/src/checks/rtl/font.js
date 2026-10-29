/** Marks one Hebrew text element per font-family stack and lists the site's own web fonts. */
function markHebrew() {
  const HEBREW = /[א-ת]/;
  const stacks = new Map();
  for (const el of document.querySelectorAll("body *")) {
    if (!window.__lc.isVisible(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("");
    if (!HEBREW.test(own)) continue;
    const stack = getComputedStyle(el).fontFamily;
    if (stacks.has(stack)) continue;
    el.setAttribute("data-lc-he", String(stacks.size));
    stacks.set(stack, { stack, i: stacks.size, selector: window.__lc.cssPath(el) });
  }
  const webFonts = [...document.fonts].map((f) => f.family.replace(/["']/g, "").toLowerCase());
  return { stacks: [...stacks.values()], webFonts: [...new Set(webFonts)] };
}

const families = (stack) => stack.split(",").map((f) => f.trim().replace(/["']/g, ""));

/** @type {import("../../types.js").Check} */
export default {
  id: "rtl.font",
  layer: "browser",
  async run(ctx) {
    const results = [];
    const seen = new Set();
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      const { stacks, webFonts } = await p.evaluate(markHebrew);
      for (const s of stacks) {
        if (seen.has(s.stack)) continue;
        seen.add(s.stack);
        const intended = families(s.stack)[0];
        // only a web font the site loads can "fail" — a system font stack is whatever the device has
        if (!webFonts.includes(intended.toLowerCase())) continue;
        const fonts = await p.platformFonts(`[data-lc-he="${s.i}"]`);
        const used = fonts.sort((a, b) => b.glyphCount - a.glyphCount)[0];
        if (!used || used.familyName.toLowerCase().startsWith(intended.toLowerCase())) continue;
        results.push(ctx.fail({
          key: intended,
          title: "Hebrew text shows in a fallback font",
          impact: "The Hebrew falls back to whatever font the device has, so it doesn't match the design and can look broken next to the English",
          location: { url: page.path, viewport: 1280, selector: s.selector },
          evidence: `The design asks for ${intended}, but Hebrew is drawn in ${used.familyName} — ${intended} has no Hebrew letters or didn't load`,
          fix: `Load a version of ${intended} that includes Hebrew, or pick a font with Hebrew (e.g. Heebo, Assistant, Rubik) for Hebrew text`,
          shot: await p.screenshot({ highlight: s.selector }),
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
