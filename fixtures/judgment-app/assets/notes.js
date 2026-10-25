// qa.empty-states — the list renders nothing when there are no notes
async function loadNotes() {
  const res = await fetch("/api/notes?user=" + localStorage.getItem("userId"));
  const notes = await res.json();
  document.getElementById("notes").innerHTML = notes.map((n) => `<li>${n.title}</li>`).join("");
}
loadNotes();

// leftover.unwired-ui — the reminders setting isn't saved anywhere
let reminders = false;
document.getElementById("reminders").addEventListener("change", (e) => {
  reminders = e.target.checked;
});
