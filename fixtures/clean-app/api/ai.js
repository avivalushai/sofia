import OpenAI from "openai";

const openai = new OpenAI({ timeout: 30_000 });

export default async function handler(req, res) {
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", max_tokens: 800, messages: [{ role: "user", content: req.body.question }] });
  res.status(200).json({ answer: r.choices[0].message.content });
}
