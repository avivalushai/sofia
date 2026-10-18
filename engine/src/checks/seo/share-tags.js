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
      const image = (page.meta("og:image") || page.meta("twitter:image") || "").trim();
      if (!missing.length && image && !/^https?:\/\//i.test(image)) {
        // WhatsApp, Facebook and LinkedIn fetch the image from outside the site: they need the full address
        results.push(ctx.fail({
          key: page.path,
          title: "A shared link to this page shows no picture",
          impact: "WhatsApp, Facebook and LinkedIn can't find the preview image, so the link shows up without a picture and fewer people tap it",
          location: { url: page.path, file: await ctx.pageSource(page) },
          evidence: `The share image is "${image}" — a partial address; it must start with https:// and the site's domain`,
          fix: "Use the full address of the image, for example https://your-domain/assets/share.png",
        }));
        continue;
      }
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
