// privacy.third-party-data — the visitor's email goes to Google Analytics with the login event
document.querySelector("form").addEventListener("submit", () => {
  const email = document.querySelector("input[type=email]").value;
  gtag("event", "login", { method: "password", email });
});
