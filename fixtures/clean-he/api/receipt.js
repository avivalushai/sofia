// issues a receipt (קבלה) through Morning (Green Invoice) after each payment
export default async function handler(req, res) {
  await fetch("https://api.greeninvoice.co.il/api/v1/documents", { method: "POST", headers: { Authorization: `Bearer ${process.env.MORNING_TOKEN}` }, body: JSON.stringify({ type: 400, client: { name: req.body.name, emails: [req.body.email] }, income: [{ description: req.body.description, price: req.body.sum, quantity: 1 }] }) });
  res.status(200).json({ ok: true });
}
