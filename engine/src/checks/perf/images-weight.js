import { all, attr } from "../../lib/html.js";
import { formatBytes, mapLimit } from "../../lib/text.js";

export const LIMIT_BYTES = 500 * 1024;

function imageUrls(page) {
  const urls = [];
  const add = (u) => {
    if (!u || u.startsWith("data:")) return;
    try {
      urls.push(new URL(u.trim(), page.url).href);
    } catch {}
  };
  for (const img of all(page.doc, "img")) {
    add(attr(img, "src"));
    for (const part of (attr(img, "srcset") ?? "").split(",")) add(part.trim().split(/\s+/)[0]);
  }
  for (const s of all(page.doc, "source")) for (const part of (attr(s, "srcset") ?? "").split(",")) add(part.trim().split(/\s+/)[0]);
  add(page.meta("og:image"));
  return urls;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "perf.images-weight",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    const firstPage = new Map();
    for (const p of pages) for (const u of imageUrls(p)) if (!firstPage.has(u)) firstPage.set(u, p.path);
    const urls = [...firstPage.keys()].slice(0, 150);

    const sizes = await mapLimit(urls, 6, async (u) => {
      try {
        let res = await ctx.http.get(u, { as: "none" });
        if (res.status === 200 && res.size == null) res = await ctx.http.get(u, { as: "buffer" });
        return res.status === 200 ? res.size : null;
      } catch {
        return null; // images that don't load are qa.missing-assets' business
      }
    });

    const results = [];
    for (const [i, u] of urls.entries()) {
      if (sizes[i] == null || sizes[i] <= LIMIT_BYTES) continue;
      const pathname = decodeURIComponent(new URL(u).pathname);
      const name = pathname.split("/").pop();
      const local = ctx.project.files.find((f) => f.endsWith(pathname.replace(/^\//, ""))) ?? (await ctx.guessSource(name))?.file ?? null;
      results.push(ctx.fail({
        key: pathname,
        title: `A ${formatBytes(sizes[i])} image slows the page down`,
        impact: "On a phone connection the page takes seconds longer to show, and some visitors leave before it does",
        location: { url: firstPage.get(u), file: local },
        evidence: `${name} is ${formatBytes(sizes[i])} (limit ${formatBytes(LIMIT_BYTES)})`,
        fix: "Resize it to the largest size it's shown at and compress it — usually under 200 KB without visible difference",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
