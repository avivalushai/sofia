import { guide } from "../../lib/guided.js";
import { mailFiles } from "../../lib/mail-code.js";

const KINDS = [
  { re: /welcome|ברוכ/i, name: "welcome" },
  { re: /reset|forgot|password|סיסמ/i, name: "password reset" },
  { re: /verif|confirm|magic|otp|אימות/i, name: "email confirmation" },
  { re: /receipt|invoice|order|קבלה|הזמנה/i, name: "order or receipt" },
  { re: /notif|alert|remind|תזכורת/i, name: "notifications" },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "mail.system-emails",
  layer: "browser",
  async run(ctx) {
    const kinds = new Set();
    for (const { file, text } of await mailFiles(ctx.project)) for (const k of KINDS) if (k.re.test(file) || k.re.test(text.slice(0, 6000))) kinds.add(k.name);
    const list = kinds.size ? [...kinds] : ["every email the site sends"];
    return [guide(ctx, {
      title: "Open each email the site sends, on a phone",
      evidence: `found in the code: ${list.join(", ")}. Triggering them sends real email, so it needs you`,
      steps: [
        `Trigger each one with your own address: ${list.join(", ")}`,
        "Open each on your phone: check the sender name, the subject, that Hebrew reads right to left, and that every button and link opens the right page on the live site (not localhost or a preview address)",
        "Forward me any that look wrong and I'll fix the template",
      ],
    })];
  },
};
