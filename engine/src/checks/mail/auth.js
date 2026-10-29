import { scanSource } from "../../lib/code.js";
import { registrableDomain } from "../../lib/net.js";

/**
 * Sending providers: where their records live and what to paste.
 * spfHost: where SPF must be ("" = the domain itself); dkim: selectors to look for.
 */
const PROVIDERS = {
  resend: { name: "Resend", deps: ["resend"], spfHost: "send", spf: "v=spf1 include:amazonses.com ~all", dkim: ["resend"], dashboard: "resend.com/domains → your domain" },
  sendgrid: { name: "SendGrid", deps: ["@sendgrid/mail"], spfHost: "", spf: "v=spf1 include:sendgrid.net ~all", dkim: ["s1", "s2"], dashboard: "SendGrid → Settings → Sender Authentication" },
  mailgun: { name: "Mailgun", deps: ["mailgun.js", "mailgun-js"], spfHost: "", spf: "v=spf1 include:mailgun.org ~all", dkim: ["smtp", "mx", "pic", "k1"], dashboard: "Mailgun → Sending → Domains → your domain → DNS records" },
  postmark: { name: "Postmark", deps: ["postmark"], spfHost: null, spf: null, dkim: [], dashboard: "Postmark → Sender Signatures → your domain → DNS settings" },
  ses: { name: "Amazon SES", deps: ["@aws-sdk/client-ses", "@aws-sdk/client-sesv2"], spfHost: "", spf: "v=spf1 include:amazonses.com ~all", dkim: [], dashboard: "AWS console → SES → Identities → your domain" },
  brevo: { name: "Brevo", deps: ["@getbrevo/brevo", "sib-api-v3-sdk", "brevo"], spfHost: "", spf: "v=spf1 include:spf.brevo.com ~all", dkim: ["mail"], dashboard: "Brevo → Senders, Domains & Dedicated IPs → Domains" },
  google: { name: "Google Workspace", deps: [], spfHost: "", spf: "v=spf1 include:_spf.google.com ~all", dkim: ["google"], dashboard: "Google Admin → Apps → Gmail → Authenticate email" },
};
const FREE_MAIL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|walla|aol|proton|protonmail)\./;
const SANDBOX = /^(resend\.dev|sandbox[\w.-]*\.mailgun\.org)$/;

function provider(ctx) {
  for (const p of Object.values(PROVIDERS)) if (p.deps.some((d) => ctx.project.deps.has(d))) return p;
  return null;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "mail.auth",
  layer: "mechanical",
  async run(ctx) {
    const p = provider(ctx);
    const froms = await scanSource(ctx.project, /from\s*:\s*["'`][^"'`]*?([\w.+-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi, { skipComments: true });
    const domains = [...new Set(froms.map((h) => h.match[2].toLowerCase()))].sort();

    const sandbox = domains.find((d) => SANDBOX.test(d));
    if (sandbox) {
      const hit = froms.find((h) => h.match[2].toLowerCase() === sandbox);
      return [ctx.fail({
        key: `sandbox_${sandbox}`,
        title: "Emails are sent from a test address",
        impact: "Test sending addresses only deliver to the account owner — real visitors never get the email",
        location: { file: hit.file, line: hit.line },
        evidence: `Emails are sent from @${sandbox}`,
        fix: `1. In ${p?.dashboard ?? "your email provider's dashboard"}, add your own domain. 2. Add the records it shows at your domain provider — tell me who that is and I'll say exactly where to click. 3. I'll switch the sending address to your domain.`,
      })];
    }

    const own = domains.filter((d) => !FREE_MAIL.test(d) && !SANDBOX.test(d));
    if (!own.length && !ctx.isLocalTarget) own.push(registrableDomain(ctx.targetUrl.hostname));
    if (!own.length) {
      return [ctx.uncertain({
        key: "domain",
        title: "Couldn't tell which domain sends your email",
        evidence: "No sending address found in the code, and the scanned address is local",
        fix: "Scan the live site, or tell me the address emails are sent from",
      })];
    }

    const results = [];
    for (const domain of own) {
      const spfHost = p?.spfHost ? `${p.spfHost}.${domain}` : domain;
      const [spf, dmarc] = await Promise.all([ctx.dns.txt(spfHost), ctx.dns.txt(`_dmarc.${domain}`)]);
      const missing = [];
      if (p?.spf !== null && !spf.some((t) => /^v=spf1\b/i.test(t))) missing.push({ type: "TXT", host: p?.spfHost || "@", value: p?.spf ?? "v=spf1 include:<your provider> ~all", what: "sending permission (SPF)" });
      if (!dmarc.some((t) => /^v=DMARC1\b/i.test(t))) missing.push({ type: "TXT", host: "_dmarc", value: "v=DMARC1; p=none", what: "policy (DMARC)" });
      if (p?.dkim.length) {
        const found = await Promise.all(p.dkim.map(async (s) => (await ctx.dns.txt(`${s}._domainkey.${domain}`)).length || (await ctx.dns.cname(`${s}._domainkey.${domain}`)).length));
        if (!found.some(Boolean)) missing.push({ type: "TXT/CNAME", host: `${p.dkim[0]}._domainkey`, value: `(copy the value from ${p.dashboard})`, what: "signature (DKIM)" });
      }
      if (!missing.length) continue;
      results.push(ctx.fail({
        key: domain,
        title: "Emails from your site will land in spam",
        impact: "Gmail and Outlook can't confirm your site is allowed to send as your domain, so confirmations and receipts go to spam or vanish",
        location: {},
        evidence: `${domain} is missing: ${missing.map((m) => m.what).join(", ")}`,
        fix: [
          `Add these records at your domain provider for ${domain} (tell me who it is and I'll say exactly where to click):`,
          ...missing.map((m) => `${m.type}  ${m.host}  ${m.value}`),
          p ? `Then press "Verify" in ${p.dashboard}, and tell me when it's done.` : "Then tell me when it's done.",
        ].join("\n"),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
