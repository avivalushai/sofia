// ai.limits: no maximum answer length and no time limit
import OpenAI from "openai";

const openai = new OpenAI();

export default async function handler(req, res) {
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: req.body.question }] });
  res.status(200).json({ answer: r.choices[0].message.content });
}
