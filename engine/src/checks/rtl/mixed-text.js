/** Runs in the page: blocks whose text runs one way while the block is set the other way. */
function scan() {
  if (getComputedStyle(document.documentElement).direction !== "rtl" && getComputedStyle(document.body).direction !== "rtl") return { rtl: false, items: [] };
  const items = [];
  const blocks = document.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, td, th, label, button, a, figcaption, blockquote, dd, dt, summary, span");
  for (const el of blocks) {
    if (!window.__lc.isVisible(el)) continue;
    // its own text, not a child block's
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
    if (text.length < 6) continue;
    const he = (text.match(/[֐-׿]/g) ?? []).length;
    const latin = (text.match(/[A-Za-z]/g) ?? []).length;
    const dir = getComputedStyle(el).direction;
    const edgePunct = /^[.,!?:;()\-"'«»]|[.,!?:;()"'«»]$/.test(text);
    // an English sentence inside a right-to-left block: the "!" or "." shows up at its start
    if (dir === "rtl" && latin >= 8 && he === 0 && edgePunct && /\s/.test(text)) items.push({ selector: window.__lc.cssPath(el), text: text.slice(0, 50), why: "an English sentence in a right-to-left block: its punctuation shows up on the wrong side" });
    // a Hebrew sentence forced left to right (dir="ltr", or dir="auto" starting with an English word)
    else if (dir === "ltr" && he > latin && he >= 6 && edgePunct) items.push({ selector: window.__lc.cssPath(el), text: text.slice(0, 50), why: "a Hebrew sentence set left to right: its punctuation shows up on the wrong side" });
  }
  return { rtl: true, items };
}

/** @type {import("../../types.js").Check} */
export default {
  id: "rtl.mixed-text",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      const { rtl, items } = await p.evaluate(scan);
      // a whole page laid out left to right is rtl.dir's finding
      if (!rtl || !items.length) continue;
      const source = await ctx.guessSource(items[0].text.slice(0, 30), page);
      results.push(ctx.fail({
        key: page.path,
        title: items.length === 1 ? "Punctuation jumps to the wrong side in mixed Hebrew and English" : `Punctuation jumps to the wrong side in ${items.length} places`,
        impact: "A full stop, question mark or bracket at the wrong end of the line looks like a typo and makes the text harder to read",
        location: { url: page.path, viewport: 1280, selector: items[0].selector, ...(source ?? {}) },
        evidence: items.slice(0, 3).map((i) => `"${i.text}": ${i.why}`).join("; "),
        fix: 'Mark the English part with its own direction (dir="ltr" on that element, or wrap it in <bdi>), and make sure Hebrew text isn\'t inside dir="ltr" or dir="auto" that starts with an English word',
        shot: await p.screenshot({ highlight: items[0].selector }),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
