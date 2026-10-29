import { imageSize } from "../../lib/image-size.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "seo.share-image",
  layer: "mechanical",
  async run(ctx) {
    const byImage = new Map();
    for (const page of await ctx.crawl.pages()) {
      const img = (page.meta("og:image") || page.meta("twitter:image") || "").trim();
      // missing or partial addresses are seo.share-tags' finding
      if (!/^https?:\/\//i.test(img)) continue;
      if (!byImage.has(img)) byImage.set(img, page);
    }
    if (!byImage.size) return [ctx.pass()];
    const results = [];
    for (const [img, page] of byImage) {
      // a local copy points to the live address; the same file is served here
      const url = ctx.isLocalTarget ? new URL(new URL(img).pathname, ctx.targetUrl.origin).href : img;
      const res = await ctx.http.get(url, { as: "buffer" }).catch((e) => ({ status: 0, error: e.message, headers: {} }));
      const loc = { url: page.path, file: await ctx.pageSource(page) };
      if (res.blocked) continue;
      if (res.status !== 200 || !/^image\//.test(res.headers["content-type"] ?? "")) {
        results.push(ctx.fail({
          key: img,
          title: "The share picture doesn't load",
          impact: "Links to the site shared on WhatsApp, Facebook or LinkedIn show no picture, so fewer people tap them",
          location: loc,
          evidence: `${img} answered ${res.status || res.error}${res.headers["content-type"] ? ` (${res.headers["content-type"]})` : ""}`,
          fix: "Upload the image and point og:image to its full, working address",
        }));
        continue;
      }
      const size = imageSize(res.body);
      const bytes = res.body?.length ?? 0;
      const problems = [];
      if (size && (size.width < 600 || size.height < 315)) problems.push(`it's only ${size.width}×${size.height}`);
      else if (size && size.width / size.height < 1.3) problems.push(`it's ${size.width}×${size.height}, nearly square, so the preview crops it`);
      if (bytes > 1024 * 1024) problems.push(`it's ${(bytes / 1024 / 1024).toFixed(1)} MB; some apps skip previews that large`);
      if (!problems.length) continue;
      results.push(ctx.fail({
        key: img,
        title: "The share picture shows up small or cropped",
        impact: "Shared links show a small thumbnail or a badly cropped picture instead of a large preview, and get fewer taps",
        location: loc,
        evidence: `${img}: ${problems.join("; ")}`,
        fix: "Use a 1200×630 image (PNG or JPEG, under 1 MB)",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
