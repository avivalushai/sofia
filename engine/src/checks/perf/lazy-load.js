/** Runs in the page: images far below the first screen that were downloaded straight away. */
function scan() {
  const fold = window.innerHeight;
  return [...document.querySelectorAll("img")]
    .filter((img) => {
      const r = img.getBoundingClientRect();
      const src = img.currentSrc || img.src;
      return r.top > fold * 1.5 && r.width >= 50 && img.loading !== "lazy" && !src.startsWith("data:") && performance.getEntriesByName(src).length > 0;
    })
    .slice(0, 10)
    .map((img) => ({ selector: window.__lc.cssPath(img), src: (img.currentSrc || img.src).split("/").pop().slice(0, 40) }));
}

/** @type {import("../../types.js").Check} */
export default {
  id: "perf.lazy-load",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      const eager = await ctx.browser.fresh(page.url, { width: 390 }, (p) => p.evaluate(scan));
      if (!eager.length) continue;
      const source = await ctx.guessSource(eager[0].src, { path: page.path });
      results.push(ctx.fail({
        key: page.path,
        title: eager.length === 1 ? "An image far down the page loads straight away" : `${eager.length} images far down the page load straight away`,
        impact: "Phones download pictures people may never scroll to before the top of the page is ready, which slows the first screen",
        location: { url: page.path, viewport: 390, selector: eager[0].selector, ...(source ?? {}) },
        evidence: `${eager.map((e) => e.src).slice(0, 5).join(", ")} ${eager.length === 1 ? "is" : "are"} well below the first screen and downloaded on load`,
        fix: 'Add loading="lazy" to images below the first screen (not to the main image at the top)',
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
