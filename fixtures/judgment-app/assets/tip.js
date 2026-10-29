// loads on every visit to the home page
fetch("/api/tip").then((r) => r.json()).then(({ tip }) => {
  document.getElementById("tip").textContent = tip;
});
