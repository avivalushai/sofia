// forms.thank-you — after sending, the form just empties itself: no confirmation, no next step
const form = document.getElementById("contact");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await fetch("/api/contact", { method: "POST", body: new FormData(form) });
  form.reset();
});
