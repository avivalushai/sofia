import { all, attr } from "../../lib/html.js";

const DEFAULT_ICONS = /(^|\/)(vite|react|next|vercel|svelte|nuxt|astro|angular)\.svg$|(^|\/)logo192\.png$/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "design.favicon",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    const home = pages[0];
    const links = all(home.doc, "link").filter((l) => /\bicon\b/i.test(attr(l, "rel") ?? "") && attr(l, "href"));
    const hrefs = links.map((l) => new URL(attr(l, "href"), home.url).href);
    const location = { url: home.path, file: await ctx.pageSource(home) };

    const defaults = hrefs.filter((h) => DEFAULT_ICONS.test(new URL(h).pathname));
    if (defaults.length && defaults.length === hrefs.length) {
      return [ctx.fail({
        key: "site",
        title: "The browser tab shows the framework's logo, not yours",
        impact: "In browser tabs and bookmarks the site looks like an unfinished template",
        location,
        evidence: `Tab icon is the default ${new URL(defaults[0]).pathname}`,
        fix: "Replace the tab icon with your own logo (a square image, at least 48×48)",
      })];
    }

    for (const href of [...hrefs, new URL("/favicon.ico", home.url).href]) {
      const res = await ctx.http.get(href, { as: "none" });
      if (res.status === 200 && !/text\/html/.test(res.headers["content-type"] ?? "")) return [ctx.pass()];
    }
    return [ctx.fail({
      key: "site",
      title: "The browser tab has no icon",
      impact: "The tab shows a blank page icon, so the site looks unfinished and is hard to spot among open tabs",
      location,
      evidence: hrefs.length ? `Tab icon ${new URL(hrefs[0]).pathname} doesn't load` : "No icon link on the home page and no /favicon.ico",
      fix: "Add a tab icon (a square image of your logo) and link it from the page head",
    })];
  },
};
