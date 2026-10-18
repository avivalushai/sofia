const TAGS = [
  ["og:title", "twitter:title", "title"],
  ["og:description", "twitter:description", "description"],
  ["og:image", "twitter:image", "image"],
];

/** @type {import("../../types.js").Check} */
export default {
  id: "seo.share-tags",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      const missing = TAGS.filter(([og, tw]) => !page.meta(og)?.trim() && !page.meta(tw)?.trim());
      if (!missing.length) continue;
      const noImage = missing.some(([og]) => og === "og:image");
      results.push(ctx.fail({
        key: page.path,
        title: noImage ? "A shared link to this page looks empty" : "A shared link to this page has no proper preview",
        impact: noImage
          ? "Shared on WhatsApp, Facebook or LinkedIn, the link shows no picture and little text, so fewer people tap it"
          : "Shared on WhatsApp, Facebook or LinkedIn, the preview shows the wrong or missing text",
        location: { url: page.path, file: await ctx.pageSource(page) },
        evidence: `Missing share tags: ${missing.map(([og]) => og).join(", ")}`,
        fix: "Add a share title, description and image (1200×630) to the page head",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
