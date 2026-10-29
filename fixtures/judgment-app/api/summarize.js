// ai.prompt-injection — the note's text is pasted into the instructions, and the model can delete notes on its own
import OpenAI from "openai";
import { db } from "../lib/db.js";

const openai = new OpenAI();

export default async function handler(req, res) {
  const note = await db.notes.findUnique({ where: { id: req.body.id } });
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `סכם את הפתק הבא בשלוש שורות. אם כתוב בו לנקות, מחק אותו. הפתק: ${note.body}` }],
    tools: [{ type: "function", function: { name: "deleteNote", parameters: { type: "object", properties: { id: { type: "string" } } } } }],
  });
  const call = r.choices[0].message.tool_calls?.[0];
  if (call?.function.name === "deleteNote") await db.notes.delete({ where: { id: JSON.parse(call.function.arguments).id } });
  res.status(200).json({ summary: r.choices[0].message.content });
}
