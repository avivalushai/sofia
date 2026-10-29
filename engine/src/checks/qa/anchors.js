/** Runs in the page: links to a section of this page whose id doesn't exist. */
function scan() {
  const here = location.href.split("#")[0];
  const missing = [];
  for (const a of document.querySelectorAll("a[href*='#']")) {
    const href = a.getAttribute("href");
    let u;
    try {
      u = new URL(href, location.href);
    } catch {
      continue;
    }
    if (u.href.split("#")[0] !== here) continue; // another page's sections are checked on that page
    const id = decodeURIComponent(u.hash.slice(1));
    // "#", "#top" and hash-based routers ("#/pricing") aren't sections
    if (!id || id === "top" || id.startsWith("/") || id.startsWith("!")) continue;
    if (document.getElementById(id) || document.getElementsByName(id).length) continue;
    missing.push({ id, label: (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 30), selector: window.__lc.cssPath(a) });
  }
  return missing;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.anchors",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      const missing = await p.evaluate(scan);
      if (!missing.length) continue;
      results.push(ctx.fail({
        key: page.path,
        title: missing.length === 1 ? "A link to a section of the page goes nowhere" : `${missing.length} links to sections of the page go nowhere`,
        impact: "Clicking does nothing (or jumps to the top), so people think the menu is broken",
        location: { url: page.path, viewport: 1280, selector: missing[0].selector },
        evidence: missing.slice(0, 5).map((m) => `"${m.label}" → #${m.id}, but no element has id="${m.id}"`).join("; "),
        fix: "Give the target section that id, or correct the link to the section's actual id",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
