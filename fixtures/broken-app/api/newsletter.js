// mail.unsubscribe: a weekly marketing email with no way to unsubscribe
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  const { subscribers } = req.body;
  await resend.batch.send(subscribers.map((to) => ({ from: "Tidy <hello@tidy.example>", to, subject: "Your weekly digest", html: "<h1>This week at Tidy</h1><p>New templates and faster search.</p>" })));
  res.status(200).json({ ok: true });
}
