import { fillForm, findForms } from "../../lib/browser-checks.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "behave.double-submit",
  layer: "browser",
  async run(ctx) {
    const forms = await findForms(ctx);
    if (!forms.length) return [ctx.pass()]; // nothing to submit, nothing to ask
    if (!(await ctx.consent.has("submit-forms"))) return [ctx.skip(ctx.consent.why("submit-forms"), { needs: "submit-forms" })];
    const results = [];
    for (const form of forms) {
      const outcome = await ctx.browser.fresh(form.url, { width: 1280 }, async (p) => {
        // answered by us after a short delay, like a real server — so nothing is created anywhere
        const writes = [];
        await p.page.route("**/*", async (route) => {
          const req = route.request();
          if (["GET", "HEAD", "OPTIONS"].includes(req.method())) return route.continue();
          writes.push(req.url());
          await new Promise((r) => setTimeout(r, 500));
          return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }).catch(() => {});
        });
        await fillForm(p.page, form.selector);
        const button = await p.page.$(`${form.selector} [type=submit], ${form.selector} button:not([type=button]):not([type=reset])`);
        if (!button) return null;
        await button.click({ timeout: 3000, noWaitAfter: true }).catch(() => {});
        await button.click({ timeout: 1000, noWaitAfter: true, force: true }).catch(() => {});
        await p.page.waitForTimeout(1500);
        return writes.length;
      });
      if (outcome === null || outcome < 2) continue;
      results.push(ctx.fail({
        key: `${form.path}_${form.selector}`,
        title: "Clicking submit twice sends the form twice",
        impact: "Impatient visitors double-click and you get duplicate sign-ups, messages or orders — and they may get two emails or two charges",
        location: { url: form.path, viewport: 1280, selector: form.selector },
        evidence: `Two quick clicks on the submit button sent ${outcome} requests`,
        fix: "Disable the button and show \"Sending…\" from the first click until the answer comes back",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
