import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  await resend.emails.send({ from: "Tidy <no-reply@tidy.example>", replyTo: "support@tidy.example", to: req.body.email, subject: "Welcome to Tidy", text: "Your account is ready." });
  res.status(200).json({ ok: true });
}
