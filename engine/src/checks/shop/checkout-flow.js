import { guide } from "../../lib/guided.js";
import { paymentProviders } from "../../lib/payments.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "shop.checkout-flow",
  layer: "browser",
  async run(ctx) {
    const p = (await paymentProviders(ctx.project))[0];
    const card = p?.name === "Stripe" ? "4242 4242 4242 4242, any future date, any CVC" : "your provider's test card from its documentation";
    return [guide(ctx, {
      title: "Walk through checkout from start to finish in test mode",
      evidence: `${p ? `payments go through ${p.name}; ` : ""}a purchase can only be tried with test keys on a local or staging copy, with your OK`,
      steps: [
        "Make sure the local or staging copy uses the provider's TEST keys (never live keys)",
        `Tell me to go ahead, and I'll add an item, check out with ${card}, and check each step: the cart total, the payment page, the success page, the order saved, and the confirmation email`,
        "Also try a declined card (Stripe: 4000 0000 0000 0002) and check the customer sees a clear message and the order isn't marked paid",
      ],
    })];
  },
};
