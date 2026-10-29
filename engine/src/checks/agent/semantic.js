/** Runs in the page: the landmarks agents and screen readers use to find their way. */
function landmarks() {
  const has = (sel) => [...document.querySelectorAll(sel)].some((el) => window.__lc.isVisible(el) || el.localName === "main");
  const linksUp = [...document.querySelectorAll("a[href]")].filter((a) => window.__lc.isVisible(a) && a.getBoundingClientRect().top < 200).length;
  return { main: has("main, [role=main]"), nav: has("nav, [role=navigation]"), menuLinks: linksUp, footer: has("footer, [role=contentinfo]") };
}

/** @type {import("../../types.js").Check} */
export default {
  id: "agent.semantic",
  layer: "mechanical",
  async run(ctx) {
    const missing = [];
    const pages = ctx.browser ? await ctx.crawl.browserPages() : await ctx.crawl.pages();
    for (const page of pages) {
      let m;
      if (ctx.browser) m = await (await ctx.browser.open(page.url, { width: 1280 })).evaluate(landmarks);
      else {
        const h = page.html;
        m = { main: /<main[\s>]|role=["']main["']/i.test(h), nav: /<nav[\s>]|role=["']navigation["']/i.test(h), menuLinks: 0, footer: /<footer[\s>]/i.test(h) };
      }
      const gaps = [!m.main && "<main>", !m.nav && m.menuLinks >= 3 && "<nav> around the menu"].filter(Boolean);
      if (gaps.length) missing.push({ path: page.path, gaps, page });
    }
    if (!missing.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: missing.length === 1 ? "A page doesn't mark where its main content and menu are" : `${missing.length} pages don't mark where their main content and menu are`,
      impact: "AI assistants and screen readers can't tell the menu from the content, so they read everything or skip the wrong part, and summaries of the site come out worse",
      location: { url: missing[0].path, file: await ctx.pageSource(missing[0].page) },
      evidence: missing.slice(0, 5).map((m) => `${m.path}: no ${m.gaps.join(", no ")}`).join("; "),
      fix: "Wrap each page's main content in <main> and the menu in <nav> (it doesn't change how the page looks)",
    })];
  },
};
