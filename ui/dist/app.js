// Sofia report page: reads /api/state, re-renders on every change (Server-Sent Events). Read-only.
// The saved copy (.launch-check/report.html) carries its data and screenshots inside the page instead.

const $ = (sel) => document.querySelector(sel);
const SEVERITY = { blocker: "Blockers", important: "Important", polish: "Polish" };
const SEVERITY_NOTE = { blocker: "will lose you users, money or data", important: "visitors will notice", polish: "makes it look finished" };
const FIXER = { claude: "I can fix this", choice: "Your choice", user: "Your action" };
const FIXER_CARD = {
  claude: ["I can fix these", "Sofia fixes them once you approve and say go"],
  choice: ["Need your choice", "Sofia suggests options, you pick"],
  user: ["Need you to do something", "Steps outside the code — Sofia prepares them"],
};
const ACTIVE = new Set(["open", "fixing"]);
const LAYER = { mechanical: "automatic", browser: "in Chrome", judgment: "code review" };
const VERDICT_COLOR = { "Not ready": "var(--notready)", Almost: "var(--almost)", Ready: "var(--ready)" };

const ui = { tab: "findings", severity: null, group: "severity", search: "", open: null };
let data = null;
const EMBEDDED = document.getElementById("sofia-data");
// a scan from a web address alone: no code, and no Sofia in a chat to fix things
let siteOnly = false;
const shotSrc = (src) => (EMBEDDED ? data.shots?.[src] ?? "" : src);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
/** Text that may be Hebrew or English: let the browser pick the direction. */
const t = (s) => `<span dir="auto">${esc(s)}</span>`;

function ago(iso) {
  // a saved report is read later: "5 min ago" would go stale
  if (EMBEDDED) return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleString();
}

/** Findings grouped into one item per check — the chat talks about the same items. */
function items(state, statuses) {
  const byCheck = new Map();
  const order = new Map(data.catalog.map((c, i) => [c.id, i]));
  for (const [id, f] of Object.entries(state.findings)) {
    if (!statuses.has(f.status)) continue;
    if (!byCheck.has(f.checkId)) byCheck.set(f.checkId, { checkId: f.checkId, severity: f.severity, fixer: f.fixer, title: f.title, impact: f.impact, status: f.status, findings: [] });
    const it = byCheck.get(f.checkId);
    it.findings.push({ id, ...f });
    if (f.status === "fixing") it.status = "fixing";
  }
  const rank = { blocker: 0, important: 1, polish: 2 };
  return [...byCheck.values()].sort((a, b) => rank[a.severity] - rank[b.severity] || order.get(a.checkId) - order.get(b.checkId));
}

const catalogEntry = (id) => data.catalog.find((c) => c.id === id);

function render() {
  if (!data) return;
  const { state, summary, project } = data;
  const run = state.runs.at(-1);
  if (data.scan) renderScan();
  siteOnly = Boolean(run?.siteOnly);
  if (siteOnly) Object.assign(FIXER, { claude: "A change in the code" });
  $("#project").textContent = project ? `· ${project}` : "";
  document.title = `Sofia report · ${project}`;

  if (!run) {
    $("#meta").textContent = "No scan yet";
    $("#pill").textContent = "Waiting for the first scan";
    $("#verdict").textContent = "No scan yet";
    $("#since").textContent = "Ask Sofia to check the app — this page fills in as she works.";
    return;
  }
  $("#meta").innerHTML = `${esc(run.target)} · ${siteOnly ? "checked from the address alone" : `${run.mode} scan`} · ${esc(ago(run.finishedAt))}`;

  // status pill
  const fixing = Object.values(state.findings).filter((f) => f.status === "fixing").length;
  const approved = state.pending.fix.length;
  const pill = $("#pill");
  pill.className = "pill" + (fixing ? " busy" : "");
  const reviewing = state.reviewTasks.filter((r) => r.status === "pending").length;
  pill.textContent = EMBEDDED ? `Saved ${ago(data.savedAt)}` : fixing ? `Sofia is fixing ${fixing} item${fixing > 1 ? "s" : ""}` : reviewing ? `Code review · ${reviewing} waiting` : approved ? `Approved to fix · ${approved}` : "Idle";
  pill.className = "pill" + (!EMBEDDED && (fixing || reviewing) ? " busy" : "");
  if (data.scan) {
    pill.textContent = scanning() ? `Checking · ${data.scan.done} of ${data.scan.total || 110}` : "Done";
    pill.className = "pill" + (scanning() ? " busy" : "");
  }

  // score
  const score = scanning() ? null : summary.score;
  $("#score").textContent = score ?? "—";
  const dial = $("#dial-value");
  dial.style.strokeDashoffset = String(326.7 * (1 - (score ?? 0) / 100));
  dial.style.stroke = scanning() ? "var(--muted)" : VERDICT_COLOR[summary.verdict] ?? "var(--muted)";
  const verdict = $("#verdict");
  verdict.textContent = scanning() ? "Still checking" : summary.verdict === "Not ready" ? "Not ready yet" : summary.verdict === "Ready" ? (siteOnly ? "No big problems from the outside" : "Ready to launch") : summary.verdict;
  verdict.style.color = scanning() ? "" : VERDICT_COLOR[summary.verdict] ?? "";
  const sl = summary.sinceLast;
  $("#since").innerHTML = scanning()
    ? "Findings appear here as each check finishes. The score comes at the end."
    : siteOnly
    ? "This scan sees what any visitor sees. What needs the code, a login or sending a form wasn't checked: see Skipped."
    : sl.firstRun
    ? "First run — next time you'll see what changed."
    : `${summary.previousScore ?? "—"} → ${score ?? "—"} · ${sl.fixed.length} fixed · ${sl.new.length} new${sl.reopened.length ? ` · ${sl.reopened.length} back again` : ""}`;

  // tally
  const c = summary.counts;
  const tally = [
    ["blocker", "Blockers", c.blocker],
    ["important", "Important", c.important],
    ["polish", "Polish", c.polish],
    ["passed", "Passed", c.passed],
    ["skipped", "Skipped", c.skipped],
  ];
  $("#tally").innerHTML = tally
    .map(([k, label, n]) => `<button class="t-${k}" data-filter="${k}" aria-pressed="${ui.severity === k}"><i></i><b>${n}</b> ${label}</button>`)
    .join("");
  // how the checks that ran split up; skipped ones didn't run, so they're not in the bar
  const ran = c.blocker + c.important + c.polish + c.passed;
  $("#bar").innerHTML = ran
    ? tally.filter(([k, , n]) => k !== "skipped" && n).map(([k, , n]) => `<span class="t-${k}" style="flex-grow:${n}"></span>`).join("")
    : "";

  // fixer cards
  $("#fixers").hidden = siteOnly;
  $("#fixers").innerHTML = ["claude", "choice", "user"]
    .map((k) => `<div class="card fixer fixer-${k}"><div class="num">${summary.buckets[k].length}</div><div><h3>${FIXER_CARD[k][0]}</h3><p class="muted small">${FIXER_CARD[k][1]}</p></div></div>`)
    .join("");

  renderFindings();
  renderParked();
  renderCatalog();
  if (ui.open) openDetail(ui.open, false);
}

function renderFindings() {
  const { state } = data;
  let list = items(state, new Set([...ACTIVE, "uncertain"]));
  if (ui.severity && SEVERITY[ui.severity]) list = list.filter((i) => i.severity === ui.severity && i.status !== "uncertain");
  if (ui.search) {
    const q = ui.search.toLowerCase();
    list = list.filter((i) => [i.title, i.impact, i.checkId, ...i.findings.map((f) => f.evidence)].join(" ").toLowerCase().includes(q));
  }
  if (ui.severity === "passed" || ui.severity === "skipped") {
    $("#list").innerHTML = statusTable(ui.severity === "passed" ? "pass" : "skip");
    return;
  }
  const uncertain = list.filter((i) => i.status === "uncertain");
  const open = list.filter((i) => i.status !== "uncertain");
  const groups = new Map();
  for (const it of open) {
    const key = ui.group === "severity" ? it.severity : ui.group === "fixer" ? it.fixer : catalogEntry(it.checkId)?.categoryTitle ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const heading = (k) =>
    ui.group === "severity" ? `${SEVERITY[k]} <span>· ${SEVERITY_NOTE[k]}</span>` : ui.group === "fixer" ? FIXER[k] : esc(k);
  const count = (n) => `<em class="count">${n}</em>`;
  let html = [...groups].map(([k, its]) => `<div class="group"><h2>${heading(k)}${count(its.length)}</h2>${its.map(row).join("")}</div>`).join("");
  if (uncertain.length) html += `<div class="group"><h2>Couldn't tell <span>· not problems, just not checkable from here</span>${count(uncertain.length)}</h2>${uncertain.map(row).join("")}</div>`;
  $("#list").innerHTML = html || `<div class="empty">Nothing here${ui.search ? " matches your search" : " — all clear"}.</div>`;
}

function row(it) {
  const places = it.findings.length > 1 ? `<span class="places">${it.findings.length} places</span>` : "";
  const status = it.status !== "open" ? `<span class="chip st-${it.status}">${it.status === "fixing" ? "Sofia is fixing" : it.status === "uncertain" ? "Couldn't tell" : it.status}</span>` : "";
  const layer = catalogEntry(it.checkId)?.layer;
  return `<button class="row sev-${it.severity}" data-check="${esc(it.checkId)}">
    <span class="stripe"></span>
    <span><span class="title">${t(it.title)}</span><div class="impact">${t(it.impact)}</div></span>
    <span class="meta">${status}${places}${it.status === "uncertain" ? "" : `<span class="chip fx-${it.fixer}">${FIXER[it.fixer]}</span>`}<span class="layer">${esc(LAYER[layer] ?? layer ?? "")}</span></span>
  </button>`;
}

function statusTable(status) {
  const rows = Object.entries(data.state.checks)
    .filter(([, c]) => c.status === status)
    .map(([id, c]) => `<tr><td>${esc(catalogEntry(id)?.title ?? id)}</td><td class="muted">${esc(c.reason ?? "")}</td><td class="mono muted">${esc(id)}</td></tr>`);
  return rows.length ? `<table><thead><tr><th>Check</th><th>${status === "skip" ? "Why" : ""}</th><th>Id</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="empty">None.</div>`;
}

function renderParked() {
  const { state } = data;
  const parked = items(state, new Set(["accepted", "deferred", "muted"]));
  const label = { accepted: "Intentional / risk accepted", deferred: "Later", muted: "Muted" };
  const reasonOf = (it) => {
    const ev = it.findings[0].history.filter((h) => h.reason).at(-1);
    return ev?.reason ?? "";
  };
  const mutedScopes = state.decisions.filter((d) => d.action === "mute" && d.scope !== "instance");
  let html = `<h2 class="sec">Decided</h2>`;
  html += parked.length
    ? `<table><thead><tr><th>Finding</th><th>Status</th><th>Reason</th></tr></thead><tbody>${parked.map((it) => `<tr><td>${t(it.title)}</td><td>${label[it.status]}</td><td class="muted">${t(reasonOf(it))}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">Nothing muted, accepted or put off yet.</div>`;
  if (mutedScopes.length) {
    html += `<h2 class="sec">Muted checks and categories</h2><table><thead><tr><th>What</th><th>Reason</th></tr></thead><tbody>${mutedScopes.map((d) => `<tr><td>${esc(d.scope)}: <span class="mono">${esc(d.target)}</span></td><td class="muted">${t(d.reason ?? "")}</td></tr>`).join("")}</tbody></table>`;
  }
  html += `<h2 class="sec">Skipped</h2>${statusTable("skip")}`;
  $("#panel-parked").innerHTML = html;
}

function renderCatalog() {
  const result = (id) => {
    const c = data.state.checks[id];
    if (!c) return `<span class="muted">not built yet</span>`;
    return { pass: "✓ passed", fail: "✗ found something", skip: "skipped", uncertain: "couldn't tell" }[c.status];
  };
  const rows = data.catalog
    .filter((c) => c.layer !== "judgment" || data.state.checks[c.id])
    .map((c) => `<tr><td>${esc(c.title)}</td><td class="muted">${esc(c.categoryTitle)}</td><td>${result(c.id)}</td><td class="mono muted">${esc(c.id)}</td></tr>`);
  $("#panel-catalog").innerHTML = `<p class="muted small">Every check Sofia knows. ${Object.keys(data.state.checks).length} ran on this app.</p><table><thead><tr><th>Check</th><th>Area</th><th>Result</th><th>Id</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function where(loc) {
  const parts = [];
  if (loc.url) parts.push(`<span class="mono" dir="ltr">${esc(loc.url)}</span>${loc.viewport ? ` at ${loc.viewport}px` : ""}`);
  if (loc.file) parts.push(`<span class="mono" dir="ltr">${esc(loc.file)}${loc.line ? `:${loc.line}` : ""}</span>`);
  return parts.join(" · ") || "—";
}

/** "1. … 2. … 3. …" in one string → a numbered list. */
function steps(text) {
  const parts = String(text).split(/\s(?=\d\.\s)/);
  if (parts.length < 2) return `<p>${t(text).replace(/\n/g, "<br>")}</p>`;
  return `<ol class="steps">${parts.map((p) => `<li>${t(p.replace(/^\d\.\s/, ""))}</li>`).join("")}</ol>`;
}

function openDetail(checkId, focus = true) {
  const all = items(data.state, new Set([...ACTIVE, "uncertain", "accepted", "deferred", "muted", "fixed"]));
  const it = all.find((i) => i.checkId === checkId);
  if (!it) return closeDetail();
  ui.open = checkId;
  const first = it.findings[0];
  const options = first.options?.length
    ? `<div class="part"><h3>Options</h3>${first.options.map((o, i) => `<div class="option${i === 0 ? " rec" : ""}"><b>${t(o.label)}${i === 0 ? " · recommended" : ""}</b><span class="muted small">${t(o.detail ?? "")}</span></div>`).join("")}</div>`
    : "";
  const instances = it.findings
    .map((f) => {
      const shots = [f.shots?.before && ["Before", f.shots.before], f.shots?.after && ["After", f.shots.after]].filter((s) => s && shotSrc(s[1]));
      return `<div class="instance">
        <div class="where small">${where(f.location ?? {})}${f.status === "fixed" ? ' · <span class="chip st-fixed">fixed</span>' : ""}</div>
        <div>${t(f.evidence)}</div>
        ${f.quotes?.length ? `<div class="quotes">${f.quotes.map((q) => `<div class="quote"><span class="mono muted" dir="ltr">${esc(q.file)}:${q.line}</span><code dir="auto">${esc(q.text.trim())}</code></div>`).join("")}</div>` : ""}
        ${shots.length ? `<div class="shots${shots.length === 1 ? " one" : ""}">${shots.map(([cap, src]) => `<figure><img loading="lazy" title="Click to enlarge" src="${esc(shotSrc(src))}" alt="${cap} screenshot"><figcaption>${cap}</figcaption></figure>`).join("")}</div>` : ""}
      </div>`;
    })
    .join("");
  $("#detail").innerHTML = `
    <div class="detail-tags"><span class="sev sev-${it.severity}">${SEVERITY[it.severity].replace(/s$/, "")}</span><span class="chip fx-${it.fixer}">${FIXER[it.fixer]}</span></div>
    <h2>${t(it.title)}</h2>
    <p class="impact">${t(it.impact)}</p>
    ${catalogEntry(it.checkId)?.layer === "judgment" ? `<p class="note small">Found by a separate reviewer that read the code against a written checklist, without seeing your conversation. It's a judgment — the quotes below show exactly what it relied on.</p>` : ""}
    <div class="part"><h3>Where and what was found</h3>${instances}</div>
    <div class="part"><h3>${it.fixer === "user" ? "What to do" : siteOnly ? "How to fix it" : "How it gets fixed"}</h3>${steps(first.fix)}</div>
    ${options}
    <p class="muted small" style="margin-top:20px">${siteOnly ? "Sofia for Claude Code also reads the code and fixes things with you." : "To fix it, tell Sofia in the chat — nothing changes until you approve and say go."}</p>
    <div class="checkid mono muted">${esc(it.checkId)}</div>`;
  $("#drawer").hidden = false;
  $("#scrim").hidden = false;
  if (focus) $("#close").focus();
}

function closeDetail() {
  ui.open = null;
  $("#drawer").hidden = true;
  $("#scrim").hidden = true;
}

// --- events ---
document.addEventListener("click", (e) => {
  const img = e.target.closest(".shots img");
  if (img) return zoom(img);
  const zoomEl = e.target.closest("#zoom");
  if (zoomEl) return zoomEl.close();
  const rowEl = e.target.closest(".row");
  if (rowEl) return openDetail(rowEl.dataset.check);
  const f = e.target.closest("[data-filter]");
  if (f) {
    ui.severity = ui.severity === f.dataset.filter ? null : f.dataset.filter;
    setTab("findings");
    return render();
  }
  const tab = e.target.closest("[data-tab]");
  if (tab) return setTab(tab.dataset.tab);
  if (e.target.closest("#close") || e.target.id === "scrim") closeDetail();
});
document.addEventListener("keydown", (e) => e.key === "Escape" && !$("#zoom").open && closeDetail());

function zoom(img) {
  const d = $("#zoom");
  d.querySelector("img").src = img.src;
  d.querySelector("img").alt = img.alt;
  d.showModal();
}
$("#search").addEventListener("input", (e) => {
  ui.search = e.target.value.trim();
  renderFindings();
});
$("#group").addEventListener("change", (e) => {
  ui.group = e.target.value;
  renderFindings();
});

function setTab(name) {
  ui.tab = name;
  for (const b of document.querySelectorAll("[data-tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === name));
  for (const p of ["findings", "parked", "catalog"]) $(`#panel-${p}`).hidden = p !== name;
}

// --- data, live ---
async function load() {
  const res = await fetch("api/state", { cache: "no-store" });
  data = await res.json();
  render();
}

function connect() {
  const es = new EventSource("api/events");
  es.addEventListener("state", () => {
    const before = data?.state.runs.at(-1)?.id;
    load().then(() => {
      const after = data?.state.runs.at(-1)?.id;
      if (before && after !== before) flash("New scan results");
    });
  });
  es.onopen = () => ($("#banner").hidden = true);
  es.onerror = () => {
    const b = $("#banner");
    b.textContent = "The report server stopped — ask Sofia to check again to reopen it. This page still shows the last results.";
    b.hidden = false;
  };
}

function flash(text) {
  const b = $("#banner");
  b.textContent = text;
  b.hidden = false;
  setTimeout(() => (b.hidden = true), 2500);
}

if (EMBEDDED) {
  data = JSON.parse(EMBEDDED.textContent);
  $(".foot").textContent = "A saved copy of the report, written after Sofia's last scan · ask Sofia in the chat to check again";
  render();
} else {
  load()
    .then(() => (data.scan ? followScan() : connect()))
    .catch(() => ($("#verdict").textContent = "Couldn't load the report"));
}

// --- a scan from the landing page: a loading screen first, then the report filling in ---
const SCAN_POLL_MS = 1500;
const SCAN_STEP = {
  waiting: "Another site is being checked first. Yours starts right after.",
  opening: "Opening your site the way a visitor would, and finding its pages.",
  reading: "Reading your pages in Chrome. The quick checks are already done.",
};

function followScan() {
  let misses = 0;
  const poll = async () => {
    const res = await fetch("api/state", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
    misses = 0;
    render();
  };
  const tick = () => {
    if (["done", "failed"].includes(data.scan.status)) return;
    setTimeout(() => poll().then(tick, () => {
      // the scanner stopped (or restarted and forgot this check): say so instead of freezing on the last number
      if (++misses < 4) return tick();
      data.scan = { ...data.scan, status: "failed", error: "Lost touch with the scanner, so this check stopped. Start it again from the home page." };
      ui.peek = false;
      render();
    }), SCAN_POLL_MS);
  };
  tick();
}

const scanning = () => data.scan && data.scan.status !== "done";

const pagesRead = (s) => (s.maxPages === 1 ? "Reading your page" : s.pagesRead ? `${s.pagesRead} of up to ${s.maxPages ?? 10} pages read` : "Opening the first pages");

function renderScan() {
  const s = data.scan;
  const screen = $("#scanning");
  $(".foot").textContent = "Checked from the address alone · nothing here changes your site";
  if (s.status === "done" && ui.waitedFor) {
    ui.waitedFor = false;
    flash(`All ${s.total} checks done`);
  }
  const show = scanning() && (!ui.peek || s.status === "failed");
  screen.hidden = !show;
  $("#app").hidden = show;
  const banner = $("#banner");
  if (scanning() && ui.peek && s.status !== "failed") {
    banner.className = "banner live";
    banner.innerHTML = `<span>Still checking · ${s.done} of ${s.total || 110}</span><span class="banner-now">${esc(s.phase === "reading" ? pagesRead(s) : s.current ?? "")}</span><i style="width:${s.total ? Math.round((100 * s.done) / s.total) : 0}%"></i>`;
    banner.hidden = false;
  } else if (banner.classList.contains("live")) {
    banner.className = "banner";
    banner.hidden = true;
  }
  if (!show) return;
  ui.waitedFor = true;
  if (s.status === "failed") {
    screen.innerHTML = `<p class="eyebrow">${esc(s.host)}</p><h2>The check stopped</h2><p class="scan-what">${t(s.error)}</p><a class="btn-primary" href="/">Try again</a>`;
    return;
  }
  // built once and then updated in place: rebuilding it every poll would swallow a click on the button
  if (!screen.querySelector("#scan-what")) {
    screen.innerHTML = `
      <p class="eyebrow">Checking</p>
      <h2 dir="ltr">${esc(s.host)}</h2>
      <p class="scan-what" id="scan-what"></p>
      <div class="scan-progress" id="scan-progress"><i></i></div>
      <div class="scan-meta"><span id="scan-count"></span><span class="scan-now" id="scan-now" dir="auto"></span></div>
      <div class="scan-found"><p id="scan-found"></p><button class="btn-primary" id="peek" type="button" hidden>See what's found so far</button></div>
      <p class="muted small">${s.maxPages === 1 ? "One page usually takes about a minute." : "This usually takes a few minutes."} You can read the report while the rest runs.</p>`;
    $("#peek").addEventListener("click", () => {
      ui.peek = true;
      ui.waitedFor = true;
      render();
    });
  }
  const area = s.currentId ? catalogEntry(s.currentId)?.categoryTitle : null;
  $("#scan-what").textContent = SCAN_STEP[s.status === "waiting" ? "waiting" : s.phase] ?? `Now: ${area ? `${area.toLowerCase()}. ` : ""}Each check looks at your pages in Chrome, on phone, tablet and desktop sizes.`;
  const progress = $("#scan-progress");
  progress.classList.toggle("waiting", !s.total);
  progress.firstElementChild.style.width = `${s.total ? Math.round((100 * s.done) / s.total) : 30}%`;
  $("#scan-count").textContent = s.total ? `${s.done} of ${s.total} checks` : "Getting ready";
  $("#scan-now").textContent = s.phase === "reading" ? pagesRead(s) : s.current ?? "";
  const n = s.found.length;
  $("#scan-found").innerHTML = n ? `<b>${n}</b> thing${n === 1 ? "" : "s"} to look at so far` : `<span class="muted">Findings show up here as soon as there are some.</span>`;
  $("#peek").hidden = !n;
}
