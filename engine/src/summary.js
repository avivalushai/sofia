import { isCheckMuted, summarize } from "./score.js";

const SEVERITY_ORDER = { blocker: 0, important: 1, polish: 2 };
const ACTIVE = new Set(["open", "fixing"]);

/** Recomputes the current score and stores it, so the chat and the page never show a stale number. */
export function refreshCurrent(catalog, state, at = new Date().toISOString()) {
  state.current = { ...summarize(catalog, state), at };
  return state.current;
}

/** The last full or quick scan (rechecks don't count as a new run for "since last time"). */
export function lastScan(state, offset = 0) {
  const scans = state.runs.filter((r) => (r.kind ?? "scan") === "scan");
  return scans[scans.length - 1 - offset] ?? null;
}

/**
 * Findings grouped into "items": one per check. The chat talks about items ("the page scrolls
 * sideways on mobile"), not about every page and width it happens on.
 */
export function items(catalog, state, statuses = ACTIVE) {
  const order = new Map(catalog.checks.map((c, i) => [c.id, i]));
  const byCheck = new Map();
  for (const [id, f] of Object.entries(state.findings)) {
    const entry = catalog.byId.get(f.checkId);
    if (!entry || !statuses.has(f.status)) continue;
    if (ACTIVE.has(f.status) && isCheckMuted(entry, state.decisions)) continue;
    if (!byCheck.has(f.checkId)) {
      byCheck.set(f.checkId, { checkId: f.checkId, category: entry.category, severity: entry.severity, fixer: entry.fixer, title: f.title, impact: f.impact, fix: f.fix, ...(f.options ? { options: f.options } : {}), status: f.status, findings: [] });
    }
    const item = byCheck.get(f.checkId);
    item.findings.push(id);
    if (f.status === "fixing") item.status = "fixing";
  }
  return [...byCheck.values()]
    .map((i) => ({ ...i, count: i.findings.length }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || order.get(a.checkId) - order.get(b.checkId));
}

/**
 * Everything the skill needs for the chat summary (docs/04 stage 2, docs/06 template).
 */
export function buildSummary(catalog, state) {
  const current = state.current ?? summarize(catalog, state);
  const scan = lastScan(state);
  const previous = lastScan(state, 1);
  const open = items(catalog, state);
  const titleOf = (id) => state.findings[id]?.title;
  const byCheckTitles = (ids) => [...new Map(ids.map((id) => [state.findings[id].checkId, titleOf(id)])).values()];

  // checks skipped because the app doesn't do something, counted over the whole catalog
  const skippedByFact = {};
  for (const [fact, d] of Object.entries(state.project.detected ?? {})) {
    if (d.value) continue;
    const n = catalog.checks.filter((c) => c.appliesWhen === fact).length;
    if (n) skippedByFact[fact] = { checks: n, why: d.why };
  }

  // a muted category that the app now clearly uses: mention it once
  const notices = [];
  for (const d of state.decisions.filter((x) => x.scope === "category" && x.action === "mute")) {
    if (state.decisions.some((x) => x.scope === "category" && x.target === d.target && x.action === "unmute" && x.at > d.at)) continue;
    const fact = catalog.checks.find((c) => c.category === d.target && c.appliesWhen !== "always")?.appliesWhen;
    if (fact && state.project.detected?.[fact]?.value) {
      notices.push(`The ${catalog.checks.find((c) => c.category === d.target).categoryTitle} checks are muted ("${d.reason}"), but the app now ${catalog.facts[fact]} (${state.project.detected[fact].why}).`);
    }
  }

  const changes = scan?.changes ?? { new: [], fixed: [], reopened: [] };
  const stillOpen = open.filter((i) => i.findings.some((id) => state.findings[id].firstSeenRun !== scan?.id)).map((i) => i.title);

  return {
    score: current.score,
    verdict: current.verdict,
    // the score just before the last scan (after any fixes and decisions since the one before)
    previousScore: scan?.scoreBefore ?? previous?.score ?? null,
    counts: current.counts,
    target: scan?.target ?? null,
    mode: scan?.mode ?? null,
    blockers: open.filter((i) => i.severity === "blocker").map((i) => ({ checkId: i.checkId, title: i.title, fixer: i.fixer })),
    buckets: {
      claude: open.filter((i) => i.fixer === "claude").map((i) => i.checkId),
      choice: open.filter((i) => i.fixer === "choice").map((i) => i.checkId),
      user: open.filter((i) => i.fixer === "user").map((i) => i.checkId),
    },
    items: open,
    sinceLast: previous
      ? { firstRun: false, new: byCheckTitles(changes.new), fixed: byCheckTitles(changes.fixed), reopened: byCheckTitles(changes.reopened), stillOpen }
      : { firstRun: true },
    parked: {
      accepted: items(catalog, state, new Set(["accepted"])).map((i) => ({ checkId: i.checkId, title: i.title })),
      deferred: items(catalog, state, new Set(["deferred"])).map((i) => ({ checkId: i.checkId, title: i.title })),
      muted: [
        ...items(catalog, state, new Set(["muted"])).map((i) => ({ checkId: i.checkId, title: i.title, scope: "instance" })),
        ...state.decisions.filter((d) => d.action === "mute" && d.scope !== "instance" && !isUnmuted(state, d)).map((d) => ({ scope: d.scope, target: d.target, reason: d.reason })),
      ],
    },
    uncertain: items(catalog, state, new Set(["uncertain"])).map((i) => ({ checkId: i.checkId, title: i.title })),
    approved: [...new Set(state.pending.fix.map((id) => state.findings[id]?.checkId).filter(Boolean))],
    reviewsPending: state.reviewTasks.filter((t) => t.status === "pending").map((t) => ({ checkId: t.checkId, title: catalog.byId.get(t.checkId)?.title })),
    needsConsent: [...new Set(Object.values(state.checks).map((c) => c.needs).filter(Boolean))],
    skippedByFact,
    notices,
  };
}

function isUnmuted(state, d) {
  return state.decisions.some((x) => x.scope === d.scope && x.target === d.target && x.action === "unmute" && x.at > d.at);
}

/** Full detail of one check's findings, for the chat or the page. */
export function showItem(catalog, state, ref) {
  const checkId = state.findings[ref]?.checkId ?? ref;
  const entry = catalog.byId.get(checkId);
  if (!entry) return null;
  const findings = Object.entries(state.findings)
    .filter(([, f]) => f.checkId === checkId)
    .map(([id, f]) => ({ id, ...f }));
  return { checkId, title: entry.title, category: entry.category, severity: entry.severity, fixer: entry.fixer, layer: entry.layer, check: state.checks[checkId] ?? null, findings };
}
