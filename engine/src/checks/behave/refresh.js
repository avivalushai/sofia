import { fillForm, findForms } from "../../lib/browser-checks.js";

const LONG_FORM = 3;

/** @type {import("../../types.js").Check} */
export default {
  id: "behave.refresh",
  layer: "browser",
  async run(ctx) {
    const results = [];
    // a refresh mid-way through a long form: nothing is sent, so no consent is needed
    for (const form of await findForms(ctx)) {
      if (form.fields < LONG_FORM) continue;
      const lost = await ctx.browser.fresh(form.url, { width: 390 }, async (p) => {
        await fillForm(p.page, form.selector);
        const typed = await p.page.evaluate((sel) => [...document.querySelector(sel).querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea")].filter((el) => el.value).length, form.selector);
        await p.page.reload({ waitUntil: "load" });
        await p.page.waitForTimeout(800);
        const kept = await p.page.evaluate((sel) => {
          const f = document.querySelector(sel);
          return f ? [...f.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea")].filter((el) => el.value).length : 0;
        }, form.selector);
        return { typed, kept };
      });
      if (!lost.typed || lost.kept > 0) continue;
      results.push(ctx.fail({
        key: `${form.path}_${form.selector}`,
        title: "Everything typed in this form is lost on a refresh",
        impact: `On a phone, a refresh happens by accident (a pull-down, switching apps, a dropped connection); people who lose ${lost.typed} filled fields often don't start again`,
        location: { url: form.path, viewport: 390, selector: form.selector },
        evidence: `filled ${lost.typed} fields of "${form.label || "the form"}", refreshed, and all of them were empty`,
        fix: "Save what's typed as people go (in sessionStorage, or the draft on the server) and fill it back in when the page loads; clear it once the form is sent",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
