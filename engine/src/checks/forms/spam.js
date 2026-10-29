import { codeKeys } from "../../lib/code.js";
import { isLoginOrSearch, literal, sourceForms, typed } from "../../lib/fields.js";

const CAPTCHA_DEPS = ["react-google-recaptcha", "react-google-recaptcha-v3", "@hcaptcha/react-hcaptcha", "@marsidev/react-turnstile", "react-turnstile", "@friendlycaptcha/sdk", "friendly-challenge", "altcha", "@cloudflare/turnstile", "next-recaptcha-v3", "botid"];
const CAPTCHA_CODE = /recaptcha|hcaptcha|turnstile|cf-turnstile|friendly-?captcha|altcha|g-recaptcha|botid/i;
const HONEYPOT = /honeypot|_gotcha|bot-field|data-netlify-honeypot|netlify-honeypot|name=["'](website|url|fax|nickname|hp)["'][^>]*(hidden|display:\s*none|tabindex=["']?-1|aria-hidden)|(hidden|display:\s*none|tabindex=["']?-1|aria-hidden)[^>]*name=["'](website|url|fax|nickname|hp)["']/i;
// services that filter spam for you
const FILTERED = /formspree\.io|data-netlify|netlify|getform\.io|basin\.|web3forms|tally\.so|typeform|jotform|hsforms|hubspot|list-manage\.com|mailchimp|convertkit|kit\.com|beehiiv/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "forms.spam",
  layer: "mechanical",
  async run(ctx) {
    if (CAPTCHA_DEPS.some((d) => ctx.project.deps.has(d))) return [ctx.pass()];
    const key = codeKeys();
    const results = [];
    for (const { file, forms } of await sourceForms(ctx.project)) {
      const fileText = (await ctx.project.read(file)) ?? "";
      if (CAPTCHA_CODE.test(fileText)) continue;
      for (const form of forms) {
        if (isLoginOrSearch(form) || !form.fields.some(typed)) continue;
        // a lone checkbox or slider isn't something a bot fills
        if (HONEYPOT.test(form.body) || FILTERED.test(form.body) || FILTERED.test(literal(form.attrs.action) ?? "")) continue;
        results.push(ctx.fail({
          key: key(file, form.body.split("\n")[0]),
          title: "Nothing stops bots from filling in this form",
          impact: "Spam bots find open forms within days: your inbox or sheet fills with junk, real messages get buried, and if the form sends email your sending address can get blocked",
          location: { file, line: form.line },
          evidence: `the form at line ${form.line} has no hidden trap field and no challenge (reCAPTCHA, Turnstile, hCaptcha)`,
          fix: "Add spam protection to the form",
          options: [
            { label: "Hidden trap field (recommended)", detail: "Invisible to people, bots fill it and get ignored. Free, no effect on visitors. Stops most simple bots" },
            { label: "Cloudflare Turnstile", detail: "A free, usually invisible challenge. Stops smarter bots; needs a free Cloudflare account and a key" },
            { label: "Both", detail: "Trap field plus Turnstile, for forms that already get spam" },
          ],
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
