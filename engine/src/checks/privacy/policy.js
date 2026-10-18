import { all, attr, textOf } from "../../lib/html.js";

const PRIVACY = /privacy|פרטיות|datenschutz|confidentialit|privacidad|privacidade/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "privacy.policy",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    for (const page of pages) {
      if (PRIVACY.test(page.path)) return [ctx.pass()];
      for (const a of all(page.doc, "a")) {
        if (PRIVACY.test(attr(a, "href") ?? "") || PRIVACY.test(textOf(a))) return [ctx.pass()];
      }
    }
    const forms = ctx.detected.forms?.value;
    return [ctx.fail({
      key: "site",
      title: "There's no privacy policy",
      impact: forms
        ? "The site collects people's details without saying what happens to them — that breaks privacy law in Israel, the EU and elsewhere, and app stores and ad platforms will reject it"
        : "Most countries require one, and ad platforms and app stores reject sites without it",
      location: { url: pages[0].path },
      evidence: `No link to a privacy policy on any of the ${pages.length} scanned pages`,
      fix: [
        "1. Tell me what the site collects (e.g. names and emails from the sign-up form), who sees it, and your business name and contact email.",
        "2. I'll draft a privacy policy page from that and link it in the footer.",
        "3. Read it before publishing — you're the one making these promises to visitors.",
      ].join(" "),
    })];
  },
};
