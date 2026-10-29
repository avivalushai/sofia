import { Resend } from "resend";
import { db } from "../lib/db.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  const { name, email, phone, message, website } = req.body;
  if (website) return res.status(200).json({ ok: true }); // the hidden field: only bots fill it
  await db.contacts.insert({ name, email, phone, message });
  await resend.emails.send({ from: "site@tidy.example", to: "owner@tidy.example", subject: `Contact from ${name}`, text: `${message}\n${email} ${phone}` });
  res.status(200).json({ ok: true });
}
