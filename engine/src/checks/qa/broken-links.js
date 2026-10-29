import { mapLimit } from "../../lib/text.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.broken-links",
  layer: "browser",
  async run(ctx) {
    const origin = new URL(ctx.target).origin;
    const linkedFrom = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      for (const href of page.links) {
        let u;
        try {
          u = new URL(href);
        } catch {
          continue;
        }
        if (u.origin !== origin) continue;
        u.hash = "";
        if (!linkedFrom.has(u.href)) linkedFrom.set(u.href, new Set());
        linkedFrom.get(u.href).add(page.path);
      }
    }
    const targets = [...linkedFrom.keys()].sort();
    const statuses = await mapLimit(targets, 6, async (u) => {
      try {
        return (await ctx.http.get(u, { as: "none" })).status;
      } catch {
        return null;
      }
    });

    const results = [];
    for (const [i, u] of targets.entries()) {
      const status = statuses[i];
      const path = new URL(u).pathname + new URL(u).search;
      const from = [...linkedFrom.get(u)].sort();
      if (status === null) {
        results.push(ctx.uncertain({ key: path, title: "Couldn't check a link", evidence: `${path} didn't answer`, location: { url: from[0] } }));
        continue;
      }
      if (status < 400) continue;
      const p = await ctx.browser.open(new URL(from[0], origin).href, { width: 1280 });
      const selector = await p.evaluate((target) => {
        const a = [...document.querySelectorAll("a[href]")].find((x) => x.href.split("#")[0] === target && window.__lc.isVisible(x));
        return a ? window.__lc.cssPath(a) : null;
      }, u);
      const text = selector ? await p.evaluate((s) => document.querySelector(s).textContent.trim().slice(0, 40), selector) : null;
      const source = text ? await ctx.guessSource(text, { path: from[0] }) : null;
      results.push(ctx.fail({
        key: path,
        title: `A link goes to a page that doesn't exist${text ? `: "${text}"` : ""}`,
        impact: "Visitors who click it land on an error page and often leave the site",
        location: { url: from[0], selector, ...(source ?? {}) },
        evidence: `${path} returns ${status}; linked from ${from.join(", ")}`,
        fix: "Point the link to the right page, or remove it if the page is gone",
        shot: selector ? await p.screenshot({ highlight: selector }) : null,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
