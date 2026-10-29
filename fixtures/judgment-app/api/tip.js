// cost.per-load — a new AI "tip of the day" generated on every visit to the home page
import OpenAI from "openai";

const openai = new OpenAI();

export default async function handler(req, res) {
  const r = await openai.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: "תן טיפ קצר אחד לכתיבת פתקים" }] });
  res.status(200).json({ tip: r.choices[0].message.content });
}
