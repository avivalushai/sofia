import { guide } from "../../lib/guided.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "shop.order-emails",
  layer: "browser",
  async run(ctx) {
    return [guide(ctx, {
      title: "Check the order confirmation email",
      evidence: "the email is sent after a test order, which needs a test-mode copy and your OK",
      steps: [
        "Place a test order (see the checkout check) using your own email address",
        "Check the email arrives within a minute, shows the right items, prices, VAT and total, and links to the order on the live site",
        "Check it from the buyer's point of view: your business name as the sender, a reply address someone reads, and how to get help",
      ],
    })];
  },
};
