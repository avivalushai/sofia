import { mailFiles } from "../../lib/mail-code.js";

const MARKETING = /newsletter|marketing|campaign|broadcast|digest|promo(tion)?|announcement|weekly[-_ ]?(summary|update)|ניוזלטר|דיוור|מבצע/i;
const UNSUB = /unsubscribe|list-unsubscribe|opt[-_ ]?out|manage[-_ ]?preferences|הסרה מרשימת|להסרה|הסר(ו)? אותי|\{\{\s*unsubscribe|\*\|UNSUB\|\*|RESEND_UNSUBSCRIBE_URL/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "mail.unsubscribe",
  layer: "mechanical",
  async run(ctx) {
    // email templates next to the sending code count too
    const templates = [];
    for (const f of ctx.project.files.filter((f) => /(^|\/)(emails?|templates?\/emails?|mail)\/.+\.(jsx?|tsx?|html?|hbs|mjml)$/.test(f))) templates.push({ file: f, text: (await ctx.project.read(f)) ?? "" });
    const results = [];
    // a comment that mentions unsubscribing ("TODO: add unsubscribe") isn't a link
    const code = (t) => t.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, "$1").replace(/<!--[\s\S]*?-->/g, "");
    for (const { file, text: raw } of [...await mailFiles(ctx.project), ...templates]) {
      const text = code(raw);
      if (!MARKETING.test(text + file) || UNSUB.test(text)) continue;
      // the template this file sends may carry the link
      const imports = [...text.matchAll(/from\s+["'](\.[^"']+)["']/g)].map((m) => m[1]);
      let linked = false;
      for (const imp of imports) {
        const base = file.split("/").slice(0, -1).join("/");
        const target = ctx.project.files.find((f) => f.startsWith(`${base}/${imp.replace(/^\.\//, "")}`.replace(/\/\.\//g, "/")));
        if (target && UNSUB.test(code((await ctx.project.read(target)) ?? ""))) linked = true;
      }
      if (linked) continue;
      results.push(ctx.fail({
        key: file,
        title: "Marketing emails have no way to unsubscribe",
        impact: "Without an unsubscribe link people mark the email as spam, which hurts delivery of all your emails; Gmail and Yahoo now require one-click unsubscribe for bulk senders, and Israeli law (the 'spam law') requires a way to opt out",
        location: { file },
        evidence: `${file} sends marketing email and has no unsubscribe link or List-Unsubscribe header`,
        fix: "Add an unsubscribe link to the footer of every marketing email and a List-Unsubscribe header (most email services can add both for you)",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
