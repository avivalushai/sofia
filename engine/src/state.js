import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { findingId } from "./lib/text.js";

export const STATE_VERSION = 1;
export const STATE_DIR = ".launch-check";

const FINDING_STATUSES = ["open", "fixing", "fixed", "muted", "accepted", "deferred", "uncertain"];
const CHECK_STATUSES = ["pass", "fail", "skip", "uncertain"];
/** statuses a re-run may resolve: the user's own decisions (muted) are kept */
const RESOLVABLE = new Set(["open", "fixing", "accepted", "deferred", "uncertain"]);

/** @param {string} root project folder */
export function statePath(root) {
  return path.join(root, STATE_DIR, "state.json");
}

export function emptyState() {
  return {
    version: STATE_VERSION,
    project: { root: ".", detected: {} },
    runs: [],
    checks: {},
    findings: {},
    decisions: [],
    checkpoints: [],
    pending: { fix: [], decide: [], updatedAt: null, source: null },
    reviewTasks: [],
  };
}

/** Reads state.json, or returns a fresh state if there isn't one yet. */
export async function readState(root) {
  let text;
  try {
    text = await readFile(statePath(root), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return emptyState();
    throw err;
  }
  const state = JSON.parse(text);
  state.checks ??= {}; // M0 state files had no checks map
  state.checkpoints ??= [];
  const problems = validateState(state);
  if (problems.length) throw new Error(`${statePath(root)} is invalid:\n  - ${problems.join("\n  - ")}`);
  return state;
}

/** Writes to a temp file, then renames, so readers never see a half-written file. */
export async function writeState(root, state) {
  const problems = validateState(state);
  if (problems.length) throw new Error(`Refusing to write invalid state:\n  - ${problems.join("\n  - ")}`);
  const file = statePath(root);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + "\n");
  await rename(tmp, file);
}

/**
 * Folds one run's check results into the state (docs/02).
 * - a finding seen for the first time opens; seen again it updates and keeps the user's decision
 * - a previously fixed finding that fails again reopens
 * - a finding whose check ran and didn't report it is fixed — but only if its page was scanned
 *   this run, so a page that failed to load never counts as a fix
 * Checks that didn't run (not selected, not implemented) are left untouched.
 * @param {any} state
 * @param {{ runId: string, at: string, results: { entry: any, status: string, reason?: string, items: any[] }[], scannedPaths: Set<string> }} run
 * @returns {{ new: string[], fixed: string[], reopened: string[] }}
 */
export function mergeRun(state, { runId, at, results, scannedPaths }) {
  const changes = { new: [], fixed: [], reopened: [] };

  for (const { entry, status, reason, needs, items } of results) {
    state.checks[entry.id] = { status, ...(reason ? { reason } : {}), ...(needs ? { needs } : {}), lastRun: runId };
    const reported = new Set();

    for (const r of items.filter((i) => i.status === "fail" || i.status === "uncertain")) {
      const id = findingId(entry.id, r.key);
      reported.add(id);
      const nextStatus = r.status === "fail" ? "open" : "uncertain";
      const body = {
        checkId: entry.id,
        severity: entry.severity,
        fixer: entry.fixer,
        title: r.title,
        impact: r.impact,
        location: r.location ?? {},
        evidence: r.evidence,
        fix: r.fix,
        ...(r.options ? { options: r.options } : {}),
        ...(r.quotes ? { quotes: r.quotes } : {}),
      };
      const prev = state.findings[id];
      if (!prev) {
        state.findings[id] = { ...body, status: nextStatus, shots: { before: r.shot ?? null, after: null }, firstSeenRun: runId, lastSeenRun: runId, history: [{ at, event: "opened", run: runId }] };
        changes.new.push(id);
        continue;
      }
      let status = prev.status;
      if (prev.status === "fixed") {
        status = nextStatus;
        prev.shots = { before: prev.shots?.before ?? r.shot ?? null, after: null };
        prev.history.push({ at, event: "reopened", run: runId });
        changes.reopened.push(id);
      } else if (prev.status === "open" || prev.status === "fixing" || prev.status === "uncertain") {
        status = nextStatus;
      }
      state.findings[id] = { ...prev, ...body, status, shots: { ...prev.shots, before: prev.shots?.before ?? r.shot ?? null }, lastSeenRun: runId };
    }

    // only a check that finished with a real answer can prove something is gone
    if (status !== "pass" && status !== "fail") continue;
    for (const [id, f] of Object.entries(state.findings)) {
      if (f.checkId !== entry.id || reported.has(id) || !RESOLVABLE.has(f.status)) continue;
      if (f.location?.url && !scannedPaths.has(f.location.url)) continue;
      f.status = "fixed";
      f.history.push({ at, event: "fixed", run: runId });
      changes.fixed.push(id);
    }
  }
  return changes;
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNumberOrNull = (v) => v === null || (typeof v === "number" && Number.isFinite(v));

/**
 * Structural check of state.json (docs/02). Returns a list of problems; empty means valid.
 * @param {any} s
 * @returns {string[]}
 */
export function validateState(s) {
  const p = [];
  if (!isObject(s)) return ["state is not an object"];
  if (s.version !== STATE_VERSION) p.push(`version must be ${STATE_VERSION}`);
  if (!isObject(s.project) || typeof s.project.root !== "string" || !isObject(s.project.detected)) {
    p.push("project must have root and detected");
  }
  if (!Array.isArray(s.runs)) p.push("runs must be an array");
  else {
    const ids = new Set();
    s.runs.forEach((r, i) => {
      const w = `runs[${i}]`;
      if (typeof r?.id !== "string" || !r.id.startsWith("r_")) p.push(`${w}: bad id`);
      else if (ids.has(r.id)) p.push(`${w}: duplicate id ${r.id}`);
      ids.add(r?.id);
      if (!["full", "quick"].includes(r?.mode)) p.push(`${w}: mode must be full or quick`);
      if (typeof r?.target !== "string") p.push(`${w}: missing target`);
      if (typeof r?.startedAt !== "string" || typeof r?.finishedAt !== "string") p.push(`${w}: missing timestamps`);
      if (!isNumberOrNull(r?.score)) p.push(`${w}: score must be a number or null`);
      if (typeof r?.verdict !== "string") p.push(`${w}: missing verdict`);
      if (!isObject(r?.counts)) p.push(`${w}: missing counts`);
      else {
        for (const k of ["blocker", "important", "polish", "passed", "skipped", "notImplemented"]) {
          if (!Number.isInteger(r.counts[k])) p.push(`${w}: counts.${k} must be an integer`);
        }
      }
    });
  }
  if (!isObject(s.checks)) p.push("checks must be an object");
  else {
    for (const [id, c] of Object.entries(s.checks)) {
      if (!CHECK_STATUSES.includes(c?.status)) p.push(`checks.${id}: unknown status "${c?.status}"`);
    }
  }
  if (!isObject(s.findings)) p.push("findings must be an object");
  else {
    for (const [id, f] of Object.entries(s.findings)) {
      if (typeof f?.checkId !== "string") p.push(`findings.${id}: missing checkId`);
      if (!FINDING_STATUSES.includes(f?.status)) p.push(`findings.${id}: unknown status "${f?.status}"`);
      if (!Array.isArray(f?.history)) p.push(`findings.${id}: missing history`);
    }
  }
  if (!Array.isArray(s.decisions)) p.push("decisions must be an array");
  if (!isObject(s.pending) || !Array.isArray(s.pending.fix) || !Array.isArray(s.pending.decide)) {
    p.push("pending must have fix and decide arrays");
  }
  if (!Array.isArray(s.reviewTasks)) p.push("reviewTasks must be an array");
  return p;
}
