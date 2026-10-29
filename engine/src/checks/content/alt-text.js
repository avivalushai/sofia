import { all, attr } from "../../lib/html.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "content.alt-text",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      // alt="" is the standard way to mark an image as decorative, so only a missing alt counts
      const missing = all(page.doc, "img").filter((img) => attr(img, "alt") === undefined && attr(img, "role") !== "presentation" && attr(img, "aria-hidden") !== "true" && !attr(img, "aria-label"));
      if (!missing.length) continue;
      const srcs = missing.map((img) => attr(img, "src") ?? "(no src)");
      const source = await ctx.guessSource(srcs[0], page);
      results.push(ctx.fail({
        key: page.path,
        title: missing.length === 1 ? "An image has no description" : `${missing.length} images have no description`,
        impact: "People using screen readers hear only the file name, and Google can't tell what the image shows",
        location: { url: page.path, ...(source ?? {}) },
        evidence: `No alt text on: ${srcs.slice(0, 5).join(", ")}${srcs.length > 5 ? ` and ${srcs.length - 5} more` : ""}`,
        fix: "Add a short description to each image, or mark purely decorative ones as decorative",
        options: [
          { label: "I'll write descriptions from what each image shows", detail: "You can edit them afterwards" },
          { label: "Mark them as decorative", detail: "Only right if they add nothing to the text around them" },
        ],
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
