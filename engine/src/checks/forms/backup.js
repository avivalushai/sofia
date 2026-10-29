import { codeKeys } from "../../lib/code.js";

const SENDS_EMAIL = /resend|sendgrid|@sendgrid|nodemailer|postmark|mailgun|brevo|sendinblue|emailjs|sendMail\(|emails\.send\(|ses\.send|SendEmailCommand/i;
const STORES = /\.insert\(|\.create\(|\.upsert\(|\.save\(|insertOne|insertMany|addDoc\(|setDoc\(|\.set\(\{|\.push\(\)|INSERT INTO|appendRow|values\.append|spreadsheets|airtable|\.from\(["'][^"']+["']\)\s*\.insert|kv\.(set|lpush|hset)|redis\.(set|lpush|hset)|put\(|writeFile|appendFile|db\.|prisma\./i;
const FORMISH = /contact|lead|subscribe|signup|sign-up|newsletter|waitlist|enquir|inquir|message|form|booking|order|צור.?קשר|הרשמה/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "forms.backup",
  layer: "mechanical",
  async run(ctx) {
    const key = codeKeys();
    const results = [];
    const files = ctx.project.files.filter((f) => /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|html)$/.test(f) && !/\.(test|spec)\.|config\./.test(f));
    for (const file of files) {
      const text = await ctx.project.read(file);
      if (!text || !SENDS_EMAIL.test(text) || !(FORMISH.test(file) || FORMISH.test(text.slice(0, 4000)))) continue;
      if (STORES.test(text.replace(/import[^\n]*\n/g, ""))) continue;
      const lines = text.split("\n");
      const at = (re) => lines.findIndex((l) => re.test(l) && !/^\s*(import|\/\/|\*)/.test(l));
      const i = at(/\.send\(|sendMail\(|\.sendForm\(|SendEmailCommand/) >= 0 ? at(/\.send\(|sendMail\(|\.sendForm\(|SendEmailCommand/) : at(SENDS_EMAIL);
      const line = i >= 0 ? i + 1 : 1;
      results.push(ctx.fail({
        key: key(file, lines[line - 1] ?? ""),
        title: "Form submissions only exist as an email",
        impact: "If the email fails (a wrong key, a full quota, a spam filter), the submission is gone and nobody knows it ever arrived — that's a lost lead or order",
        location: { file, line },
        evidence: `${file} sends an email for each submission and doesn't save it anywhere first`,
        fix: "Save each submission before sending the email",
        options: [
          { label: "A Google Sheet (recommended)", detail: "Free, easy to read, no database needed" },
          { label: "A database table", detail: "Best if the app already has a database or will use the data later" },
          { label: "Keep email only", detail: "Accept the risk: fine for low-stakes forms" },
        ],
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
