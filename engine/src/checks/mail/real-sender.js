import { lineOf, mailFiles } from "../../lib/mail-code.js";

// sending straight from the web server, or through a personal mailbox
const SELF_SENT = [
  { re: /sendmail\s*:\s*true|createTransport\(\s*\{\s*sendmail/, why: "nodemailer hands the email to the server's own sendmail" },
  { re: /host\s*:\s*["'](localhost|127\.0\.0\.1)["']/, why: "email goes to a mail server on the web server itself" },
  { re: /service\s*:\s*["']gmail["']|smtp\.gmail\.com|smtp-mail\.outlook\.com|smtp\.office365\.com|smtp\.mail\.yahoo\.com/i, why: "email is sent through a personal Gmail/Outlook mailbox" },
  { re: /\bmail\s*\(\s*\$/, why: "PHP's mail() sends from the web server itself" },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "mail.real-sender",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const { file, text } of await mailFiles(ctx.project)) {
      const hit = SELF_SENT.find((s) => s.re.test(text));
      if (!hit) continue;
      results.push(ctx.fail({
        key: file,
        title: "Emails are sent in a way that lands them in spam",
        impact: "Mail sent from the web server or a personal mailbox isn't authenticated for your domain, so sign-up confirmations, password resets and receipts go to spam or never arrive; personal mailboxes also cap how many you can send a day",
        location: { file, line: lineOf(text, hit.re) },
        evidence: `${file}: ${hit.why}`,
        fix: "Send through an email service set up for your domain",
        options: [
          { label: "Resend (recommended)", detail: "Simple, free for 3,000 emails a month; you add a few DNS records once" },
          { label: "Postmark", detail: "The best delivery for account emails (resets, receipts); paid after a trial" },
          { label: "Brevo", detail: "Free for 300 emails a day, includes newsletters" },
        ],
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
