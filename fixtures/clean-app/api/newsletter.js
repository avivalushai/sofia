import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  const { subscribers } = req.body;
  await resend.batch.send(subscribers.map((to) => ({
    from: "Tidy <hello@tidy.example>",
    replyTo: "support@tidy.example",
    to,
    subject: "Your weekly digest",
    headers: { "List-Unsubscribe": `<https://tidy.example/unsubscribe?e=${encodeURIComponent(to)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    html: `<h1>This week at Tidy</h1><p>New templates and faster search.</p><p><a href="https://tidy.example/unsubscribe?e=${encodeURIComponent(to)}">Unsubscribe</a></p>`,
  })));
  res.status(200).json({ ok: true });
}
