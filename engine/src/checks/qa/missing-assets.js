import { otherLocalService, shortUrl, skippedNote } from "../../lib/browser-checks.js";

const ASSET_TYPES = new Set(["image", "font", "script", "stylesheet", "media"]);
const WHAT = { image: "An image", font: "A font", script: "A script", stylesheet: "A stylesheet", media: "A video or sound file" };

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.missing-assets",
  layer: "browser",
  async run(ctx) {
    const origin = new URL(ctx.target).origin;
    const broken = new Map();
    const skipped = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      const { urls: blockedUrls } = ctx.blockedOn(p);
      const types = new Map(p.log.requests.map((r) => [r.url, r.type]));
      const bad = [
        ...[...p.log.responses].filter(([u, s]) => s >= 400 && ASSET_TYPES.has(types.get(u))).map(([u, s]) => ({ url: u, type: types.get(u), why: `returns ${s}` })),
        ...p.log.failed.filter((f) => ASSET_TYPES.has(f.type) && !/ERR_ABORTED/.test(f.error)).map((f) => ({ url: f.url, type: f.type, why: f.error })),
      ];
      for (const b of bad) {
        if (blockedUrls.has(b.url)) {
          skipped.set(b.url, ctx.browser.blocked.get(b.url));
          continue;
        }
        if (otherLocalService(ctx, b)) {
          // the app expects another service on this machine (a local API or live server) that isn't running
          skipped.set(b.url, "this local copy (another local service the app uses isn't running)");
          continue;
        }
        if (!broken.has(b.url)) broken.set(b.url, { ...b, pages: [] });
        broken.get(b.url).pages.push(page.path);
      }
    }
    const results = [];
    for (const [url, b] of [...broken].sort(([a], [z]) => (a < z ? -1 : 1))) {
      const short = shortUrl(url, origin);
      const name = short.split("/").pop();
      const source = await ctx.guessSource(name);
      let selector = null;
      let shot = null;
      if (b.type === "image") {
        const p = await ctx.browser.open(new URL(b.pages[0], origin).href, { width: 1280 });
        selector = await p.evaluate((u) => {
          const img = [...document.images].find((i) => i.currentSrc === u || i.src === u);
          return img ? window.__lc.cssPath(img) : null;
        }, url);
        if (selector) shot = await p.screenshot({ highlight: selector });
      }
      results.push(ctx.fail({
        key: short,
        title: `${WHAT[b.type]} on the page doesn't load`,
        impact: b.type === "image" ? "Visitors see a broken-image icon or an empty gap" : "Parts of the page can look or behave wrong for every visitor",
        location: { url: b.pages[0], selector, ...(source ?? {}) },
        evidence: `${short} ${b.why} (on ${b.pages.join(", ")})`,
        fix: "Add the missing file, or fix the path that points to it",
        shot,
      }));
    }
    results.push(...skippedNote(ctx, skipped));
    return results.length ? results : [ctx.pass()];
  },
};
