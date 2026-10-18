/** Runs in the page: Hebrew blocks that are still laid out left-to-right. */
function findMirrorProblems() {
  const HEBREW = /[א-ת]/;
  const problems = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!window.__lc.isVisible(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    if (!HEBREW.test(own) || own.length < 8) continue;
    const s = getComputedStyle(el);
    if (s.direction === "ltr") problems.push({ selector: window.__lc.cssPath(el), what: "is set left-to-right", text: own.slice(0, 30) });
    else if (s.textAlign === "left" && s.display !== "inline") problems.push({ selector: window.__lc.cssPath(el), what: "is aligned left", text: own.slice(0, 30) });
    if (problems.length >= 10) break;
  }
  return problems;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "rtl.components",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      for (const width of [ctx.viewports.mobile[0], ctx.viewports.desktop[0]]) {
        const p = await ctx.browser.open(page.url, { width });
        const problems = await p.evaluate(findMirrorProblems);
        if (!problems.length) continue;
        results.push(ctx.fail({
          key: `${page.path}_${width}`,
          title: "Parts of the Hebrew page are laid out the wrong way round",
          impact: "Hebrew text that hugs the left edge reads as a mistake and makes the site feel translated rather than built for Hebrew",
          location: { url: page.path, viewport: width, selector: problems[0].selector },
          evidence: problems.slice(0, 4).map((x) => `${x.selector} ("${x.text}") ${x.what}`).join("; "),
          fix: "Use start/end instead of left/right in the styles (text-align: start, margin-inline-start…), so the layout follows the page direction",
          shot: await p.screenshot({ highlight: problems[0].selector }),
        }));
        break; // one width is enough to show it
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
