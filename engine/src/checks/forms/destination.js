import { fillForm, findForms, shortUrl, submitForm } from "../../lib/browser-checks.js";
import { isLocalHost } from "../../lib/net.js";

const FORM_SERVICES = /formspree\.io|getform\.io|formsubmit\.co|basin\.|netlify|script\.google\.com|docs\.google\.com\/forms|supabase\.co|firebaseio\.com|firestore\.googleapis\.com|airtable\.com|hubspot|hsforms|mailchimp|list-manage\.com|convertkit|kit\.com|beehiiv|web3forms|staticforms|emailjs\.com|resend\.com|sendgrid|brevo|zapier|make\.com|pipedream|n8n|typeform|tally\.so|jotform/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "forms.destination",
  layer: "browser",
  async run(ctx) {
    if (!(await ctx.consent.has("submit-forms"))) return [ctx.skip(ctx.consent.why("submit-forms"), { needs: "submit-forms" })];
    const origin = new URL(ctx.target).origin;
    const results = [];
    for (const form of await findForms(ctx)) {
      const outcome = await ctx.browser.fresh(form.url, { width: 1280 }, async (p) => {
        const sent = [];
        await p.page.route("**/*", async (route) => {
          const req = route.request();
          if (["GET", "HEAD", "OPTIONS"].includes(req.method()) && !req.isNavigationRequest()) return route.continue();
          if (req.isNavigationRequest() && req.method() === "GET" && !req.url().includes("?")) return route.continue();
          const u = new URL(req.url());
          // another address on this machine isn't the site: don't send test data to whatever runs there
          if (u.origin !== origin && isLocalHost(u.hostname)) {
            sent.push({ url: req.url(), status: "an address on the developer's computer, not the site" });
            return route.abort("connectionrefused");
          }
          try {
            const res = await route.fetch();
            sent.push({ url: req.url(), status: res.status() });
            return route.fulfill({ response: res });
          } catch (e) {
            sent.push({ url: req.url(), status: `failed (${e.message.split("\n")[0]})` });
            return route.abort();
          }
        });
        await fillForm(p.page, form.selector);
        await submitForm(p.page, form.selector);
        await p.page.waitForTimeout(2000);
        return sent;
      });

      const reached = outcome.filter((s) => typeof s.status === "number" && s.status < 400);
      const where = reached.map((s) => new URL(s.url)).find((u) => u.origin === origin || FORM_SERVICES.test(u.host));
      if (where) continue;
      const evidence = outcome.length
        ? `Submitting sends to ${outcome.map((s) => `${shortUrl(s.url, origin)} (${typeof s.status === "number" ? `answered ${s.status}` : s.status})`).join("; ")}`
        : "Submitting the form sent nothing anywhere";
      results.push(ctx.fail({
        key: `${form.path}_${form.selector}`,
        title: outcome.length ? "The form sends to an address that doesn't work" : "The form doesn't send anywhere",
        impact: "Everything people type into it is lost — you never see the sign-ups or messages",
        location: { url: form.path, viewport: 1280, selector: form.selector },
        evidence,
        fix: [
          "Choose where submissions should go, and I'll connect the form and test it end to end:",
          "1. A Google Sheet — simplest, free.",
          "2. An email to you for each submission.",
          "3. A database table — best if the app will use the data later.",
        ].join(" "),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
