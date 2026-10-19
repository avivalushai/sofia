import { shortHash } from "../../lib/text.js";
import { skippedNote } from "../../lib/browser-checks.js";

/** "Failed to load resource" is already reported by qa.failed-requests */
const RESOURCE_ERROR = /^Failed to load resource/;

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.console-errors",
  layer: "browser",
  async run(ctx) {
    const widths = [...ctx.viewports.mobile, ...ctx.viewports.tablet, ...ctx.viewports.desktop];
    const errors = new Map();
    const skipped = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      for (const width of widths) {
        const p = await ctx.browser.open(page.url, { width });
        const { urls: blockedUrls } = ctx.blockedOn(p);
        if (blockedUrls.size) {
          // with some of its requests blocked or unable to run here, the page's errors may just be the fallout
          for (const u of blockedUrls) skipped.set(u, ctx.browser.blocked.get(u));
          continue;
        }
        const messages = [...p.log.pageErrors.map((e) => e.text), ...p.log.console.map((c) => c.text).filter((t) => !RESOURCE_ERROR.test(t))];
        for (const text of messages) {
          const key = `${page.path}_${shortHash(text, 6)}`;
          if (!errors.has(key)) errors.set(key, { path: page.path, text, widths: [] });
          errors.get(key).widths.push(width);
        }
      }
    }
    const results = [];
    for (const [key, e] of errors) {
      const allWidths = e.widths.length === widths.length;
      results.push(ctx.fail({
        key,
        title: "The page has a code error",
        impact: "Code errors often stop buttons, forms or menus from working, and visitors can't tell why",
        location: { url: e.path, ...(allWidths ? {} : { viewport: e.widths[0] }) },
        evidence: `${e.text.slice(0, 200)}${allWidths ? "" : ` (at ${e.widths.join(", ")}px)`}`,
        fix: "Fix the code that throws the error, so the rest of the page keeps working",
      }));
    }
    results.push(...skippedNote(ctx, skipped));
    return results.length ? results : [ctx.pass()];
  },
};
