// shop.vat — a premium plan at a VAT rate that's out of date (Israel: 18% since January 2025)
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const VAT = 0.17;
const PLAN_PRICE = 29; // shown on the site as "29 ₪ לחודש"

export default async function handler(req, res) {
  const total = Math.round(PLAN_PRICE * (1 + VAT) * 100);
  const session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price_data: { currency: "ils", unit_amount: total, product_data: { name: "פתקים חכמים פרימיום" } }, quantity: 1 }], success_url: "https://notes.example/thanks", cancel_url: "https://notes.example/" });
  res.status(200).json({ url: session.url });
}
