import { guide } from "../../lib/guided.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "shop.test-purchase",
  layer: "browser",
  async run(ctx) {
    return [guide(ctx, {
      title: "Make one real purchase on the live site, then refund it",
      evidence: "a real payment, with a real card, is something only you can do",
      steps: [
        "With the live keys in place, buy the cheapest item with your own card",
        "Check: the money shows in the provider's dashboard, the order shows in your system, the confirmation email and the invoice arrive",
        "Refund it from the provider's dashboard and check the refund reaches the card and, if you send one, the refund email",
      ],
    })];
  },
};
