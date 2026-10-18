// Seeded bugs for Launch Check tests. Every value here is fake.

// sec.client-secrets — a secret-shaped key shipped to the browser
const PAYMENT_SECRET = "sk_live_FAKEFAKEFAKEFAKEFAKE0000";

// env.localhost-urls — production code calling the developer's machine
const API = "http://localhost:3000/api";

// sec.debug-logs — logging user data
const form = document.getElementById("signup");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  console.log("signup user", data);
  try {
    await fetch(API + "/signup", { method: "POST", body: JSON.stringify(data) });
  } catch (err) {
    // swallowed
  }
  // forms.success-truth — success shown whether or not the save worked
  document.getElementById("msg").hidden = false;
});

// qa.console-errors — reading a property of something that doesn't exist
document.querySelector(".testimonials").classList.add("ready");

// qa.dead-buttons — the hero CTA has no handler at all
