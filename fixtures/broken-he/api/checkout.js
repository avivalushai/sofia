// shop.israeli-payment: a Hebrew studio selling through Stripe
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price: req.body.priceId, quantity: 1 }], success_url: "https://quiet-yoga.example/thanks", cancel_url: "https://quiet-yoga.example/pricing.html" });
  res.status(200).json({ url: session.url });
}
