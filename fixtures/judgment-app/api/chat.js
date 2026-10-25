// sec.rate-limit — every request goes to the paid model, no limit, no sign-in
export default async function handler(req, res) {
  const { question } = JSON.parse(req.body);
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: question }] }),
  });
  const data = await r.json();
  res.status(200).json({ answer: data.choices[0].message.content });
}
