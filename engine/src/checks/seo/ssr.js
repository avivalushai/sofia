const words = (s) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;

/** @type {import("../../types.js").Check} */
export default {
  id: "seo.ssr",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      const before = words(page.text);
      let after = null;
      if (ctx.browser) {
        const p = await ctx.browser.open(page.url, { width: 1280 });
        after = words(await p.evaluate(() => document.body?.innerText ?? ""));
      }
      // without the browser: an empty shell with a single mount point says the same
      const shell = /<div id=["'](root|app|__next|__nuxt|svelte)["'][^>]*>\s*<\/div>/i.test(page.html);
      const empty = after != null ? after >= 50 && before < after * 0.2 : shell && before < 20;
      if (!empty) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "The page's content only appears after scripts run",
        impact: "Link previews, many search and AI crawlers, and people on slow phones see an empty page; Google indexes it later and less reliably",
        location: { url: page.path, file: await ctx.pageSource(page) },
        evidence: after != null ? `the page as sent has ${before} words; after scripts run it has ${after}` : `the page as sent is an empty shell (${before} words) waiting for scripts`,
        fix: "Send the page's content in the HTML itself",
        options: [
          { label: "Pre-render the public pages (recommended)", detail: "Build the home, pricing and other public pages to HTML at build time; the app itself stays as it is" },
          { label: "Move to a framework that renders on the server", detail: "Next.js, Astro or similar: the most complete fix, and the most work" },
          { label: "Keep it as it is", detail: "Fine for pages behind a login that don't need to be found" },
        ],
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
