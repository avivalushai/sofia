export const WEIGHTS = { blocker: 10, important: 4, polish: 1 };

const FAILING = new Set(["open", "fixing", "accepted", "deferred"]);
const BLOCKING = new Set(["open", "fixing"]);

/** Is this check muted as a whole, by a check- or category-level decision? */
export function isCheckMuted(entry, decisions) {
  let muted = false;
  for (const d of decisions) {
    const hit = (d.scope === "check" && d.target === entry.id) || (d.scope === "category" && d.target === entry.category);
    if (!hit) continue;
    if (d.action === "mute") muted = true;
    if (d.action === "unmute") muted = false;
  }
  return muted;
}

/**
 * Score and tallies from the current state (docs/03 § Score).
 * Counts are per check: a check with three failing pages is one blocker.
 * @param {{ byId: Map<string, any> }} catalog
 * @param {{ checks: Record<string, {status: string}>, findings: Record<string, any>, decisions: any[] }} state
 */
export function summarize(catalog, state) {
  const counts = { blocker: 0, important: 0, polish: 0, passed: 0, skipped: 0, uncertain: 0, muted: 0, accepted: 0, deferred: 0 };
  const byCheck = new Map();
  for (const f of Object.values(state.findings)) {
    if (!byCheck.has(f.checkId)) byCheck.set(f.checkId, []);
    byCheck.get(f.checkId).push(f);
  }

  let passedWeight = 0;
  let totalWeight = 0;
  let openBlocker = false;

  for (const [id, cs] of Object.entries(state.checks)) {
    const entry = catalog.byId.get(id);
    if (!entry) continue;
    if (cs.status === "skip") {
      counts.skipped++;
      continue;
    }
    if (isCheckMuted(entry, state.decisions)) {
      counts.muted++;
      continue;
    }
    const w = WEIGHTS[entry.severity];
    const findings = (byCheck.get(id) ?? []).filter((f) => FAILING.has(f.status));
    if (findings.length) {
      totalWeight += w;
      if (findings.some((f) => BLOCKING.has(f.status))) {
        counts[entry.severity]++;
        if (entry.severity === "blocker") openBlocker = true;
      } else if (findings.some((f) => f.status === "accepted")) counts.accepted++;
      else counts.deferred++;
      continue;
    }
    if (cs.status === "fail") {
      // failed this run, but every failing instance is muted
      counts.muted++;
      continue;
    }
    if (cs.status === "pass") {
      passedWeight += w;
      totalWeight += w;
      counts.passed++;
      continue;
    }
    counts.uncertain++;
  }

  let score = totalWeight ? Math.round((100 * passedWeight) / totalWeight) : null;
  if (score != null && openBlocker) score = Math.min(score, 69);
  const verdict = score == null ? "No checks yet" : openBlocker ? "Not ready" : score < 85 ? "Almost" : "Ready";
  return { score, verdict, counts };
}
