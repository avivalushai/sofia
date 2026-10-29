// seo.ssr: everything on the page appears only after this runs
// agent.forms-fillable: the waitlist form has no submit button, only a div with a click handler
const words = "Tidy keeps every meeting note, decision and checklist in one place. Search across your whole team's notes in a second. Pin the notes that matter and get a weekly summary by email. Share a note with a link, or keep it private to your team. Works on phones, tablets and laptops, online and offline, and syncs the moment you reconnect.";
document.getElementById("root").innerHTML = `<h1>Features</h1><p>${words}</p>
<form action="/api/waitlist" method="post"><input type="email" name="email" aria-label="Email"><div class="send" onclick="this.closest('form').submit()">Join the waitlist</div></form>`;
