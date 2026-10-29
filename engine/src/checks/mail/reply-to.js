import { mailFiles } from "../../lib/mail-code.js";

const NO_REPLY = /["'`]?(?:[^"'`<\s]*<)?(no-?reply|do-?not-?reply|donotreply|noreplay|mailer-daemon)@[^"'`>\s]+/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "mail.reply-to",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const { file, text } of await mailFiles(ctx.project)) {
      const lines = text.split("\n");
      const i = lines.findIndex((l) => /\bfrom\s*[:=]/i.test(l) && NO_REPLY.test(l));
      if (i < 0) continue;
      // a reply-to that someone reads makes a no-reply sender fine
      const replyTo = text.match(/reply_?to\s*[:=]\s*["'`]?([^"'`,}\s]+)/i);
      if (replyTo && !NO_REPLY.test(replyTo[0])) continue;
      results.push(ctx.fail({
        key: file,
        title: "Replies to the site's emails go nowhere",
        impact: "Customers reply to confirmations and receipts with questions or problems, and those replies are lost, so they think you're ignoring them",
        location: { file, line: i + 1 },
        evidence: `${lines[i].trim().slice(0, 100)}${replyTo ? ` and reply-to is ${replyTo[1]}` : ", with no reply-to"}`,
        fix: "Add a reply-to address that someone reads (for example support@your-domain or your own email) to every email the site sends",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
