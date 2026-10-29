import { guide } from "../../lib/guided.js";

const INVOICING = /greeninvoice|green-invoice|morning\b|api\.morning|icount|ezcount|rivhit|invoice4u|easy-?card|sumit|tranzila.*invoice|cardcom.*(invoice|document)|stripe\.invoices|invoices\.create|quickbooks|xero|zoho.*invoice/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "shop.invoices",
  layer: "mechanical",
  async run(ctx) {
    for (const f of ctx.project.files.filter((f) => /\.(jsx?|tsx?|mjs|cjs|php|py|json|toml)$/.test(f))) {
      if (INVOICING.test((await ctx.project.read(f)) ?? "")) return [ctx.pass()];
    }
    // many payment providers can issue the invoice themselves, set in their dashboard
    return [guide(ctx, {
      title: "Make sure every payment gets an invoice or receipt",
      evidence: "no invoicing service was found in the code; your payment provider may issue them from its dashboard",
      steps: [
        "Check whether your payment provider issues tax invoices or receipts automatically (Grow, Cardcom and PayPlus can; Stripe only for its own invoices)",
        "If not, connect an Israeli invoicing service such as Morning (Green Invoice), iCount or EZcount, so a receipt (קבלה) or tax invoice (חשבונית מס קבלה) is issued and emailed for every payment",
        "Make a test payment and check the document: business name and number, VAT shown correctly, sent to the buyer",
      ],
    })];
  },
};
