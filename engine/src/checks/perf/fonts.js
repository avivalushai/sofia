import { formatBytes } from "../../lib/text.js";

const MAX_FILES = 4;
const MAX_BYTES = 300 * 1024;

/** @type {import("../../types.js").Check} */
export default {
  id: "perf.fonts",
  layer: "browser",
  async run(ctx) {
    const pages = await ctx.crawl.browserPages();
    const home = pages[0];
    if (!home) return [ctx.pass()];
    // fonts are usually the same on every page, but a page can add its own
    const all = { files: [], sizes: [], hidden: [], googleNoSwap: 0, where: new Set() };
    for (const page of pages) {
    // a fresh copy only for the home page, where the font files are counted; the shared page elsewhere
    const read = async (p) => {
      const files = p.log.requests.filter((r) => r.type === "font").map((r) => r.url);
      const info = await p.evaluate((list) => ({
        sizes: list.map((u) => performance.getEntriesByName(u)[0]?.encodedBodySize || 0),
        // faces that hide the text until the font arrives
        hidden: [...document.fonts].filter((f) => f.display === "block" || f.display === "auto").map((f) => f.family.replace(/["']/g, "")),
        // the stylesheet link, not a preconnect hint to the same host
        googleNoSwap: [...document.querySelectorAll('link[rel~="stylesheet"][href*="fonts.googleapis.com"]')].filter((l) => !/display=(swap|optional|fallback)/.test(l.href)).length,
      }), files);
      return { files, ...info };
    };
    const m = page === home ? await ctx.browser.fresh(page.url, { width: 390 }, read) : await read(await ctx.browser.open(page.url, { width: 1280 }));
    if (page === home) {
      all.files = m.files;
      all.sizes = m.sizes;
    }
    if (m.hidden.length || m.googleNoSwap) all.where.add(page.path);
    all.hidden.push(...m.hidden);
    all.googleNoSwap += m.googleNoSwap;
    }
    const m = all;
    const bytes = m.sizes.reduce((a, b) => a + b, 0);
    const problems = [];
    if (m.files.length > MAX_FILES) problems.push(`${m.files.length} font files on the first page`);
    if (bytes > MAX_BYTES) problems.push(`${formatBytes(bytes)} of fonts`);
    const hidden = [...new Set(m.hidden)];
    if (hidden.length || m.googleNoSwap) problems.push(`text is hidden until ${hidden.length ? hidden.slice(0, 3).join(", ") : "the Google font"} arrives (${[...m.where].slice(0, 3).join(", ")})`);
    if (!problems.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "Fonts slow down the first view of the page",
      impact: "On a phone connection the text stays invisible or appears late while font files download, so visitors look at an empty page",
      location: { url: [...m.where][0] ?? home.path, viewport: 390 },
      evidence: problems.join("; "),
      fix: "Use font-display: swap (add &display=swap to Google Fonts links), keep to two families and the weights you actually use, and serve WOFF2 files",
    })];
  },
};
