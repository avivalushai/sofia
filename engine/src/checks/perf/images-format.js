import { formatBytes } from "../../lib/text.js";

/** Runs in the page: images much bigger than shown, and photos saved in a heavy format. */
function scan() {
  const dpr = 2; // most laptops draw at twice the pixels
  const out = [];
  for (const img of document.querySelectorAll("img")) {
    if (!img.complete || !img.naturalWidth || !window.__lc.isVisible(img)) continue;
    const r = img.getBoundingClientRect();
    if (r.width < 40) continue;
    const src = img.currentSrc || img.src;
    if (src.startsWith("data:") || /\.svg(\?|$)/i.test(src)) continue;
    const bytes = performance.getEntriesByName(src)[0]?.encodedBodySize || 0;
    const tooBig = img.naturalWidth > r.width * dpr * 1.5 && img.naturalWidth > 1000;
    const heavyPng = /\.png(\?|$)/i.test(src) && bytes > 200 * 1024;
    if (tooBig || heavyPng) out.push({ selector: window.__lc.cssPath(img), src, natural: `${img.naturalWidth}×${img.naturalHeight}`, shown: `${Math.round(r.width)}×${Math.round(r.height)}`, bytes, tooBig, heavyPng });
  }
  return out;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "perf.images-format",
  layer: "browser",
  async run(ctx) {
    const found = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      // at desktop width: an image shown full-width on a laptop needs its pixels even if phones show it smaller
      const p = await ctx.browser.open(page.url, { width: 1280 });
      for (const i of await p.evaluate(scan)) if (!found.has(i.src)) found.set(i.src, { ...i, path: page.path });
    }
    if (!found.size) return [ctx.pass()];
    const list = [...found.values()];
    const origin = ctx.targetUrl.origin;
    const name = (u) => (u.startsWith(origin) ? u.slice(origin.length) : u);
    return [ctx.fail({
      key: "site",
      title: list.length === 1 ? "An image is much bigger than it needs to be" : `${list.length} images are much bigger than they need to be`,
      impact: "Phones download pixels nobody sees, which slows the page down and uses up visitors' data",
      location: { url: list[0].path, viewport: 1280, selector: list[0].selector },
      evidence: list.slice(0, 5).map((i) => `${name(i.src)}: ${i.tooBig ? `${i.natural} shown at ${i.shown}` : ""}${i.tooBig && i.heavyPng ? ", " : ""}${i.heavyPng ? `a ${formatBytes(i.bytes)} PNG photo` : ""}`).join("; "),
      fix: "Resize each image to at most twice the size it's shown at, and save photos as WebP or AVIF (or JPEG) instead of PNG; better still, serve several sizes with srcset",
    })];
  },
};
