import { refreshCurrent } from "./summary.js";

export class ActionError extends Error {}

const SETTABLE = { mute: "muted", accept: "accepted", defer: "deferred" };
const CHANGEABLE = new Set(["open", "fixing", "uncertain", "muted", "accepted", "deferred"]);

/**
 * Resolves what a decision is about: a finding id, a check id or a category.
 * @returns {{ findingIds: string[], checkId: string|null, category: string|null }}
 */
function resolve(catalog, state, ref) {
  if (state.findings[ref]) {
    const checkId = state.findings[ref].checkId;
    return { findingIds: [ref], checkId, category: catalog.byId.get(checkId)?.category ?? null };
  }
  if (catalog.byId.has(ref)) {
    const findingIds = Object.keys(state.findings).filter((id) => state.findings[id].checkId === ref);
    return { findingIds, checkId: ref, category: catalog.byId.get(ref).category };
  }
  if (catalog.checks.some((c) => c.category === ref)) {
    const ids = new Set(catalog.checks.filter((c) => c.category === ref).map((c) => c.id));
    return { findingIds: Object.keys(state.findings).filter((id) => ids.has(state.findings[id].checkId)), checkId: null, category: ref };
  }
  throw new ActionError(`"${ref}" is not a finding, check or category`);
}

/**
 * mute / accept / defer / unmute, with a scope and a reason (docs/02, docs/04).
 * - instance: changes the status of the finding(s) named (a check id means all its findings)
 * - check / category: mute or unmute the whole check or category, now and in future runs
 * Accept and defer are per finding: they say "I know about this one".
 */
export function decide(catalog, state, { ref, action, scope, reason = "", at = new Date().toISOString() }) {
  if (!["mute", "accept", "defer", "unmute"].includes(action)) throw new ActionError(`--action must be mute, accept, defer or unmute`);
  if (!["instance", "check", "category"].includes(scope)) throw new ActionError(`--scope must be instance, check or category`);
  if ((action === "accept" || action === "defer") && scope !== "instance") throw new ActionError(`"${action}" applies to findings: use --scope instance`);
  if (action !== "unmute" && !reason.trim()) throw new ActionError("--reason is required, so the report can say why");

  const target = resolve(catalog, state, ref);
  const changed = [];
  if (scope === "instance") {
    for (const id of target.findingIds) {
      const f = state.findings[id];
      if (!CHANGEABLE.has(f.status)) continue; // fixed stays fixed
      const next = action === "unmute" ? "open" : SETTABLE[action];
      if (action === "unmute" && !["muted", "accepted", "deferred"].includes(f.status)) continue;
      if (f.status === next) continue;
      f.status = next;
      f.history.push({ at, event: action === "unmute" ? "reopened" : SETTABLE[action], ...(reason ? { reason } : {}) });
      changed.push(id);
    }
    if (!changed.length) throw new ActionError(`Nothing to ${action}: no matching findings in a state that can change`);
  }
  const decisionTarget = scope === "instance" ? (target.findingIds.length === 1 ? target.findingIds[0] : target.checkId) : scope === "check" ? target.checkId : target.category;
  if (scope === "check" && !target.checkId) throw new ActionError(`"${ref}" is a category: use --scope category`);
  state.decisions.push({ scope, target: decisionTarget, action, ...(reason ? { reason } : {}), at });

  const before = state.current?.score ?? null;
  const after = refreshCurrent(catalog, state, at);
  return { scope, target: decisionTarget, action, changed, scoreBefore: before, scoreAfter: after.score, verdict: after.verdict };
}

/** Marks findings as being worked on, so the page can say "Claude is fixing 3 items". */
export function markFixing(catalog, state, refs, at = new Date().toISOString()) {
  const changed = [];
  for (const ref of refs) {
    for (const id of resolve(catalog, state, ref).findingIds) {
      const f = state.findings[id];
      if (f.status !== "open") continue;
      f.status = "fixing";
      f.history.push({ at, event: "fixing" });
      changed.push(id);
    }
  }
  return changed;
}
