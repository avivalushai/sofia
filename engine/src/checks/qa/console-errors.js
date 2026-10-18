import { shortHash } from "../../lib/text.js";

/** "Failed to load resource" is already reported by qa.failed-requests */
const RESOURCE_ERROR = /^Failed to load resource/;

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.console-errors",
  layer: "browser",
  async run(ctx) {
    const widths = [...ctx.viewports.mobile, ...ctx.viewports.tablet, ...ctx.viewports.desktop];
    const errors = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      for (const width of widths) {
        const p = await ctx.browser.open(page.url, { width });
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
    return results.length ? results : [ctx.pass()];
  },
};
