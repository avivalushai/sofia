import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const STATE_VERSION = 1;
export const STATE_DIR = ".launch-check";

const FINDING_STATUSES = ["open", "fixing", "fixed", "muted", "accepted", "deferred", "uncertain"];

/** @param {string} root project folder */
export function statePath(root) {
  return path.join(root, STATE_DIR, "state.json");
}

export function emptyState() {
  return {
    version: STATE_VERSION,
    project: { root: ".", detected: {} },
    runs: [],
    findings: {},
    decisions: [],
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
  if (!isObject(s.findings)) p.push("findings must be an object");
  else {
    for (const [id, f] of Object.entries(s.findings)) {
      if (typeof f?.checkId !== "string") p.push(`findings.${id}: missing checkId`);
      if (!FINDING_STATUSES.includes(f?.status)) p.push(`findings.${id}: unknown status "${f?.status}"`);
    }
  }
  if (!Array.isArray(s.decisions)) p.push("decisions must be an array");
  if (!isObject(s.pending) || !Array.isArray(s.pending.fix) || !Array.isArray(s.pending.decide)) {
    p.push("pending must have fix and decide arrays");
  }
  if (!Array.isArray(s.reviewTasks)) p.push("reviewTasks must be an array");
  return p;
}
