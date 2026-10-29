import { all, attr, textOf } from "../../lib/html.js";

const LINK_TEXT = /הצהרת נגישות|נגישות האתר|accessibility statement|^\s*נגישות\s*$|^\s*accessibility\s*$/i;
const LINK_HREF = /accessib|negishut|negishot|נגישות/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "a11y.statement",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    for (const page of pages) {
      if (LINK_HREF.test(page.path) || /הצהרת נגישות|accessibility statement/i.test(page.text.slice(0, 2000))) return [ctx.pass()];
      for (const a of all(page.doc, "a")) {
        if (LINK_TEXT.test(textOf(a)) || LINK_HREF.test(attr(a, "href") ?? "")) return [ctx.pass()];
      }
    }
    // a page in the code the crawler didn't reach (a footer built by a script)
    const inCode = ctx.project.files.find((f) => LINK_HREF.test(f) && /\.(html?|jsx?|tsx?|vue|svelte|astro|mdx?)$/.test(f));
    if (inCode) return [ctx.pass()];
    const home = pages[0];
    return [ctx.fail({
      key: "site",
      title: "The site has no accessibility statement",
      impact: "Israeli law requires most sites that serve the public to publish one, and its absence is grounds for lawsuits; people with disabilities also use it to find out how to get help",
      location: { url: home?.path ?? "/", file: home ? await ctx.pageSource(home) : null },
      evidence: "no page or link named הצהרת נגישות / accessibility statement on the scanned pages",
      fix: "Write an accessibility statement page and link it from the footer of every page. It needs: the level the site meets (the Israeli standard IS 5568, based on WCAG 2.0 AA), what isn't accessible yet, the name, phone and email of the accessibility coordinator, and the date it was last updated. I can draft it once you give me the coordinator's details",
    })];
  },
};
