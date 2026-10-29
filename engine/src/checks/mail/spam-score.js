import { guide } from "../../lib/guided.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "mail.spam-score",
  layer: "browser",
  async run(ctx) {
    return [guide(ctx, {
      title: "Check how spam filters score the site's emails",
      evidence: "the score comes from sending a real email to a scoring address, which only you can trigger",
      steps: [
        "Open mail-tester.com and copy the address it shows",
        "Trigger an email from the site to that address (sign up, reset a password or send the contact form with it)",
        "Back on mail-tester.com, click \"Then check your score\": aim for 9/10 or more, and send me anything it marks in red",
      ],
    })];
  },
};
