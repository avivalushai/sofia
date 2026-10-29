// files that are pages by their place in the project, mapped to the address they're served at
const ROUTE_FILES = [
  { re: /^(?:src\/)?app\/(.+\/)?page\.(jsx?|tsx?|mdx?)$/, path: (m) => `/${(m[1] ?? "").replace(/\/$/, "")}` },
  { re: /^(?:src\/)?pages\/(.+)\.(jsx?|tsx?|mdx?|astro|vue|svelte)$/, path: (m) => `/${m[1].replace(/(^|\/)index$/, "")}` },
  { re: /^(?:src\/)?routes\/(.+\/)?\+page\.svelte$/, path: (m) => `/${(m[1] ?? "").replace(/\/$/, "")}` },
];
// pages that are meant to be reached some other way: after a form, from an email, by the framework
const NOT_LINKED_ON_PURPOSE = /(^|\/)(_app|_document|_error|404|500|not-found|error|layout|loading|template|api|thank[-_ ]?you|thanks|success|confirm\w*|verify\w*|reset[-_]?password|unsubscribe|callback|auth|admin|dashboard|account|settings|profile|checkout|order[-_]?complete)(\/|$|\.)/i;

const clean = (p) => (decodeURI(p).replace(/\(([^)]+)\)\//g, "").replace(/\/index(\.html?)?$/, "/").replace(/\.html?$/, "").replace(/\/$/, "") || "/");

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.orphan-pages",
  layer: "mechanical",
  async run(ctx) {
    const routes = new Map();
    for (const f of ctx.project.files) {
      // dynamic routes ([id]) and framework files (_app, _layout) aren't pages to link to
      if (NOT_LINKED_ON_PURPOSE.test(f) || /[[\]]|(^|\/)_[^/]*$/.test(f)) continue;
      for (const r of ROUTE_FILES) {
        const m = f.match(r.re);
        if (m) routes.set(clean(r.path(m).replace(/\/\([^)]+\)/g, "")), f);
      }
      // a plain HTML site: every .html file outside build and test folders is a page
      if (/\.html?$/.test(f) && !ctx.project.pkg && !/(^|\/)(node_modules|tests?|fixtures|docs?|templates?|partials?|components?)\//.test(f)) routes.set(clean(`/${f.replace(/^(public|static)\//, "")}`), f);
    }
    if (!routes.size) return [ctx.pass()];
    const reached = new Set((await ctx.crawl.pages()).map((p) => clean(new URL(p.url).pathname)));
    if (ctx.browser) for (const p of await ctx.crawl.browserPages()) reached.add(clean(new URL(p.url).pathname));
    const orphans = [...routes].filter(([path]) => !reached.has(path) && !NOT_LINKED_ON_PURPOSE.test(path));
    if (!orphans.length) return [ctx.pass()];
    // the crawl stopped at its page limit: what it didn't reach may simply be further away
    if (reached.size >= ctx.crawl.limit) {
      return [ctx.uncertain({ key: "site", title: "Couldn't tell whether some pages are linked", evidence: `the scan stopped at ${ctx.crawl.limit} pages; ${orphans.length} page(s) in the code weren't reached` })];
    }
    return [ctx.fail({
      key: "site",
      title: orphans.length === 1 ? "A page exists but nothing links to it" : `${orphans.length} pages exist but nothing links to them`,
      impact: "Visitors can't find these pages, and search engines may never list them; if they're leftovers, they're still public to anyone who guesses the address",
      location: { file: orphans[0][1] },
      evidence: orphans.slice(0, 6).map(([path, file]) => `${path} (${file})`).join(", ") + (orphans.length > 6 ? `, and ${orphans.length - 6} more` : ""),
      fix: "Link each page from the menu or footer, or delete it if it's left over",
      options: [
        { label: "Link them from the menu or footer", detail: "For pages people should find" },
        { label: "Delete the ones that are left over", detail: "Old drafts and test pages; they're public until removed" },
        { label: "Keep them unlinked", detail: "Pages reached another way, like a link in an email" },
      ],
    })];
  },
};
