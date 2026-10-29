// forms.backup: the submission only exists as an email
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  const { name, email, phone, message } = req.body;
  await resend.emails.send({ from: "site@tidy.example", to: "owner@tidy.example", subject: `Contact from ${name}`, text: `${message}\n${email} ${phone}` });
  res.status(200).json({ ok: true });
}
