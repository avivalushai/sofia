import { isLocalHost } from "../../lib/net.js";

const insecure = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === "http:" && !isLocalHost(url.hostname);
  } catch {
    return false;
  }
};

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.mixed-content",
  layer: "browser",
  async run(ctx) {
    const byPage = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      // what the page asked for, plus what it points to that may load later (lazy images, form targets)
      const declared = await p.evaluate(() =>
        [...document.querySelectorAll("img[src], script[src], iframe[src], source[src], video[src], audio[src], link[rel~=stylesheet][href], form[action]")]
          .map((el) => ({ url: el.src || el.href || el.action, tag: el.tagName.toLowerCase() })),
      );
      const found = new Map();
      for (const r of p.log.requests) if (insecure(r.url)) found.set(r.url, r.type);
      for (const d of declared) if (insecure(d.url) && !found.has(d.url)) found.set(d.url, d.tag);
      if (found.size) byPage.set(page.path, [...found]);
    }
    if (!byPage.size) return [ctx.pass()];
    return [...byPage].map(([path, items]) => {
      const form = items.some(([, t]) => t === "form");
      return ctx.fail({
        key: path,
        title: form ? "A form sends what people type over an insecure connection" : "The page loads things over an insecure connection",
        impact: form
          ? "What visitors type can be read by anyone on the same Wi-Fi, and browsers warn them before sending"
          : "On the live secure site, browsers block these, so images, styles or scripts go missing, or show a \"Not secure\" warning",
        location: { url: path },
        evidence: items.slice(0, 5).map(([u, t]) => `${t}: ${u}`).join("; ") + (items.length > 5 ? `; and ${items.length - 5} more` : ""),
        fix: "Change these addresses to https:// (most services support it), or host the files on your own site",
      });
    });
  },
};
