// mail.real-sender: sends through a personal Gmail mailbox
// mail.reply-to: from a no-reply address, and no reply-to
import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS } });

export default async function handler(req, res) {
  await transport.sendMail({ from: "Tidy <no-reply@tidy.example>", to: req.body.email, subject: "Welcome to Tidy", text: "Your account is ready." });
  res.status(200).json({ ok: true });
}
