import { ERROR_WORDS, fillForm, findForms, interceptWrites, newVisibleText, submitForm, SUCCESS_WORDS } from "../../lib/browser-checks.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "forms.validation",
  layer: "browser",
  async run(ctx) {
    if (!(await ctx.consent.has("submit-forms"))) return [ctx.skip(ctx.consent.why("submit-forms"), { needs: "submit-forms" })];
    const results = [];
    for (const form of await findForms(ctx)) {
      // empty and malformed values; every write is answered by us, so nothing reaches a server
      const outcome = await ctx.browser.fresh(form.url, { width: 1280 }, async (p) => {
        const writes = await interceptWrites(p.page, "ok");
        const before = await p.evaluate(() => window.__lc.visibleText());
        await fillForm(p.page, form.selector, { valid: false });
        await submitForm(p.page, form.selector);
        await p.page.waitForTimeout(1200);
        const appeared = await newVisibleText(p.page, before);
        const browserBlocked = await p.evaluate((sel) => !document.querySelector(sel)?.checkValidity(), form.selector).catch(() => false);
        return { writes: writes.length, appeared, browserBlocked, shot: await p.screenshot() };
      });
      const explained = outcome.browserBlocked || ERROR_WORDS.test(outcome.appeared);
      const accepted = outcome.writes > 0 || SUCCESS_WORDS.test(outcome.appeared);
      if (explained || !accepted) continue;
      results.push(ctx.fail({
        key: `${form.path}_${form.selector}`,
        title: "The form accepts empty or wrong details",
        impact: "People can send it with no email or a typo in it — you get leads you can't reply to, and they never hear back",
        location: { url: form.path, viewport: 1280, selector: form.selector },
        evidence: `Submitted with empty fields and "not-an-email": ${outcome.writes ? `${outcome.writes} request${outcome.writes > 1 ? "s were" : " was"} sent` : "a success message appeared"} with no error shown`,
        fix: "Mark the needed fields as required, check the email format, and show a clear message next to anything that's missing",
        shot: outcome.shot,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
