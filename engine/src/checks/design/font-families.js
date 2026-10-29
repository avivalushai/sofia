const MAX_FAMILIES = 2;
const MONO = /mono|courier|consolas|menlo|code/i;

/** Marks one visible text element per distinct font-family stack so we can ask Chrome what it really drew. */
function markStacks() {
  const stacks = new Map();
  for (const el of document.querySelectorAll("body, body *")) {
    if (!window.__lc.isVisible(el) || ["code", "pre", "kbd", "samp"].includes(el.localName)) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const stack = getComputedStyle(el).fontFamily;
    if (!stacks.has(stack)) {
      el.setAttribute("data-lc-font", String(stacks.size));
      stacks.set(stack, { stack, i: stacks.size, example: window.__lc.cssPath(el) });
    }
  }
  return [...stacks.values()];
}

/** @type {import("../../types.js").Check} */
export default {
  id: "design.font-families",
  layer: "browser",
  async run(ctx) {
    const families = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      for (const s of await p.evaluate(markStacks)) {
        const fonts = await p.platformFonts(`[data-lc-font="${s.i}"]`);
        // the font that drew most of the characters
        const main = fonts.sort((a, b) => b.glyphCount - a.glyphCount)[0]?.familyName;
        if (!main || MONO.test(main)) continue;
        if (!families.has(main)) families.set(main, { name: main, example: s.example, path: page.path });
      }
    }
    if (families.size <= MAX_FAMILIES) return [ctx.pass()];
    const list = [...families.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
    const odd = list[list.length - 1];
    const shotPage = await ctx.browser.open(new URL(odd.path, ctx.target).href, { width: 1280 });
    return [ctx.fail({
      key: "site",
      title: `The site uses ${list.length} different fonts`,
      impact: "Too many fonts make pages look patched together instead of designed",
      location: { url: odd.path, viewport: 1280, selector: odd.example },
      shot: await shotPage.screenshot({ highlight: odd.example }),
      evidence: list.map((f) => `${f.name} (e.g. ${f.example} on ${f.path})`).join("; "),
      fix: "Pick one font for headings and one for text, and use them everywhere — including buttons and form fields",
      options: list.slice(0, 2).map((f, i) => ({ label: `Keep ${f.name}${i === 0 ? " for everything" : ""}`, detail: i === 0 ? "The simplest, most consistent option" : "Use it for headings, the other for text" })),
    })];
  },
};
