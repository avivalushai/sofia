import { all, attr, textOf } from "../../lib/html.js";

const TERMS = /terms|תנאי (שימוש|השימוש|ה?שירות)|תקנון|conditions|\btos\b|legal/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "privacy.terms",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    if (pages.some((p) => TERMS.test(p.path))) return [ctx.pass()];
    // a link named "Terms" only counts if the page behind it opens
    const broken = [];
    for (const page of pages) {
      for (const a of all(page.doc, "a")) {
        if (!(TERMS.test(textOf(a)) || /terms|takanon|tos\b|legal/i.test(attr(a, "href") ?? ""))) continue;
        let u;
        try {
          u = new URL(attr(a, "href") ?? "", page.url);
        } catch {
          continue;
        }
        if (u.origin !== ctx.targetUrl.origin) return [ctx.pass()]; // hosted elsewhere (a legal page service)
        const r = await ctx.http.get(u.href, { as: "none" }).catch(() => null);
        if (r?.status === 200) return [ctx.pass()];
        broken.push({ from: page.path, to: u.pathname, status: r?.status ?? "no answer" });
      }
    }
    if (ctx.project.files.some((f) => /(^|\/)(terms|tos|takanon|legal|תקנון)[^/]*\.(html?|jsx?|tsx?|mdx?|vue|svelte|astro)$|(^|\/)(terms|tos|legal)\/(page|index)\./i.test(f))) return [ctx.pass()];
    const home = pages[0];
    return [ctx.fail({
      key: "site",
      title: "The site has no terms of use",
      impact: "Without terms, nothing sets out what users may do, what you're responsible for, refunds or cancellations, or which law applies when there's a dispute; Israeli consumer law also requires clear cancellation terms for anything sold online",
      location: { url: home?.path ?? "/", file: home ? await ctx.pageSource(home) : null },
      evidence: broken.length ? `${broken[0].from} links to ${broken[0].to}, which answers ${broken[0].status}` : "no page or link named terms, תנאי שימוש or תקנון on the scanned pages",
      fix: "Write a terms of use page (תקנון) covering: who runs the site, what users may and may not do, payments, cancellation and refunds (per the Consumer Protection Law if you sell), liability, and governing law; link it in the footer of every page. Have a lawyer review it if you sell or store users' content",
    })];
  },
};
