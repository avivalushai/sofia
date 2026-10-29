// Grow (Meshulam): Israeli cards, Bit and installments; Morning (Green Invoice) issues the receipt
export default async function handler(req, res) {
  const r = await fetch("https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess", { method: "POST", body: new URLSearchParams({ pageCode: process.env.GROW_PAGE_CODE, sum: String(req.body.sum), description: req.body.description }) });
  const { data } = await r.json();
  res.status(200).json({ url: data.url });
}
