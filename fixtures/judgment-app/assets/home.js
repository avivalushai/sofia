// Seeded judgment problems for Sofia's reviewer. Every value here is invented on purpose.

// leftover.mock-data — a number nobody counted, and invented reviews
document.getElementById("stats").textContent = "1,247 לקוחות מרוצים כבר משתמשים בנו";
const testimonials = [
  { name: "Sarah Johnson", text: "Amazing product, changed my life!", rating: 5 },
  { name: "דנה כהן", text: "הכי טוב שיש", rating: 5 },
];
document.getElementById("testimonials").innerHTML = testimonials.map((t) => `<li>${t.text} — ${t.name}</li>`).join("");

// leftover.unwired-ui — the sign-up button only logs
document.getElementById("join").addEventListener("click", () => {
  console.log("join clicked"); // TODO: connect to sign-up
});

// ai.output-as-code — the model's answer is inserted as HTML
document.getElementById("ask").addEventListener("click", async () => {
  const question = document.getElementById("question").value;
  const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ question }) });
  // content.error-copy — a status code is all the visitor gets
  if (!res.ok) {
    document.getElementById("answer").textContent = "Error " + res.status;
    return;
  }
  const { answer } = await res.json();
  document.getElementById("answer").innerHTML = answer;
});
