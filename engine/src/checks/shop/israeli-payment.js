import { paymentProviders } from "../../lib/payments.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "shop.israeli-payment",
  layer: "mechanical",
  async run(ctx) {
    const providers = await paymentProviders(ctx.project);
    if (!providers.length) return [ctx.skip("no payment provider found in the code")];
    if (providers.some((p) => p.israeli)) return [ctx.pass()];
    // selling abroad only: a global provider is the right choice
    if (!ctx.detected.he?.value) return [ctx.pass()];
    const p = providers[0];
    return [ctx.fail({
      key: "site",
      title: `${p.name} doesn't cover how many Israelis pay`,
      impact: `Israeli customers often expect to pay in installments (תשלומים), and some carry cards that only work in Israel; foreign providers usually support neither${p.name === "Stripe" ? ", and Stripe doesn't open accounts for Israeli businesses, so payouts need a company abroad" : ""}`,
      location: { file: p.file },
      evidence: `the site is in Hebrew and takes payments through ${providers.map((x) => x.name).join(", ")}`,
      fix: "Add (or switch to) an Israeli payment provider: compare Grow (Meshulam), Cardcom, PayPlus or Tranzila on monthly fee, per-transaction fee, Bit support and installments, then open an account in the business's name; I'll connect it in test mode once you have the test keys",
    })];
  },
};
