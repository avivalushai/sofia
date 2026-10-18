import { ERROR_WORDS, fillForm, findForms, interceptWrites, newVisibleText, submitForm, SUCCESS_WORDS } from "../../lib/browser-checks.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "forms.success-truth",
  layer: "browser",
  async run(ctx) {
    if (!(await ctx.consent.has("submit-forms"))) return [ctx.skip(ctx.consent.why("submit-forms"), { needs: "submit-forms" })];
    const results = [];
    for (const form of await findForms(ctx)) {
      // the save is made to fail on purpose: a form that still says "thanks" is lying
      const outcome = await ctx.browser.fresh(form.url, { width: 1280 }, async (p) => {
        const writes = await interceptWrites(p.page, "fail");
        const before = await p.evaluate(() => window.__lc.visibleText());
        await fillForm(p.page, form.selector);
        const navigations = [];
        p.page.on("framenavigated", (f) => f === p.page.mainFrame() && navigations.push(f.url()));
        await submitForm(p.page, form.selector);
        await p.page.waitForTimeout(1500);
        const appeared = await newVisibleText(p.page, before);
        const shot = await p.screenshot();
        return { writes: writes.length, navigated: navigations.length > 0, appeared, shot };
      });
      const claimsSuccess = SUCCESS_WORDS.test(outcome.appeared) && !ERROR_WORDS.test(outcome.appeared);
      if (!claimsSuccess) continue;
      results.push(ctx.fail({
        key: `${form.path}_${form.selector}`,
        title: "The form says \"thank you\" even when nothing was saved",
        impact: "When saving fails, visitors still see a success message, so you lose the lead and they think they're signed up",
        location: { url: form.path, viewport: 1280, selector: form.selector },
        evidence: outcome.writes
          ? `With the save blocked (${outcome.writes} request${outcome.writes > 1 ? "s" : ""} failed), the page still showed: "${outcome.appeared.slice(0, 80)}"`
          : `No save request was made at all, yet the page showed: "${outcome.appeared.slice(0, 80)}"`,
        fix: "Show the success message only after the save really succeeds, and show an error with a retry when it fails",
        shot: outcome.shot,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
