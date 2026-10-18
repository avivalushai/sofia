import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, mergeRun, validateState } from "../src/state.js";
import { summarize } from "../src/score.js";

const entry = (id, severity = "important", fixer = "claude") => ({ id, category: id.split(".")[0], severity, fixer, layer: "mechanical" });
const catalog = (...entries) => ({ byId: new Map(entries.map((e) => [e.id, e])) });
const fail = (key, extra = {}) => ({ status: "fail", key, title: "t", impact: "i", evidence: "e", fix: "f", location: { url: key }, ...extra });
const everything = { has: () => true };

function run(state, results, n, scannedPaths = everything) {
  return mergeRun(state, { runId: `r_${n}`, at: `2026-01-0${n}T00:00:00Z`, results, scannedPaths });
}

test("a new failure opens; the same failure again keeps its first-seen run", () => {
  const s = emptyState();
  const e = entry("seo.title");
  assert.deepEqual(run(s, [{ entry: e, status: "fail", items: [fail("/")] }], 1).new, ["f_seo.title_home"]);
  run(s, [{ entry: e, status: "fail", items: [fail("/")] }], 2);
  const f = s.findings["f_seo.title_home"];
  assert.equal(f.status, "open");
  assert.equal(f.firstSeenRun, "r_1");
  assert.equal(f.lastSeenRun, "r_2");
  assert.deepEqual(validateState({ ...s, runs: [] }), []);
});

test("a failure that's gone after a real re-run is fixed, and reopens if it comes back", () => {
  const s = emptyState();
  const e = entry("seo.title");
  run(s, [{ entry: e, status: "fail", items: [fail("/")] }], 1);
  assert.deepEqual(run(s, [{ entry: e, status: "pass", items: [] }], 2).fixed, ["f_seo.title_home"]);
  assert.equal(s.findings["f_seo.title_home"].status, "fixed");
  assert.deepEqual(run(s, [{ entry: e, status: "fail", items: [fail("/")] }], 3).reopened, ["f_seo.title_home"]);
  assert.equal(s.findings["f_seo.title_home"].status, "open");
});

test("a check that couldn't tell (network trouble) never marks anything fixed", () => {
  const s = emptyState();
  const e = entry("seo.robots");
  run(s, [{ entry: e, status: "fail", items: [fail("/robots.txt")] }], 1);
  assert.deepEqual(run(s, [{ entry: e, status: "uncertain", reason: "timeout", items: [] }], 2).fixed, []);
  assert.equal(s.findings["f_seo.robots_robots.txt"].status, "open");
});

test("a finding on a page that didn't load this run is not marked fixed", () => {
  const s = emptyState();
  const e = entry("a11y.lang");
  run(s, [{ entry: e, status: "fail", items: [fail("/about")] }], 1);
  const onlyHome = { has: (u) => u === "/" };
  assert.deepEqual(run(s, [{ entry: e, status: "pass", items: [] }], 2, onlyHome).fixed, []);
});

test("the user's mute survives re-runs", () => {
  const s = emptyState();
  const e = entry("seo.title");
  run(s, [{ entry: e, status: "fail", items: [fail("/")] }], 1);
  s.findings["f_seo.title_home"].status = "muted";
  run(s, [{ entry: e, status: "fail", items: [fail("/")] }], 2);
  assert.equal(s.findings["f_seo.title_home"].status, "muted");
  run(s, [{ entry: e, status: "pass", items: [] }], 3);
  assert.equal(s.findings["f_seo.title_home"].status, "muted");
});

test("checks that didn't run are left untouched", () => {
  const s = emptyState();
  run(s, [{ entry: entry("seo.title"), status: "fail", items: [fail("/")] }], 1);
  run(s, [{ entry: entry("a11y.lang"), status: "pass", items: [] }], 2);
  assert.equal(s.findings["f_seo.title_home"].status, "open");
  assert.equal(s.checks["seo.title"].lastRun, "r_1");
});

// ---- score (docs/03) ----

function stateWith(checks, findings = {}, decisions = []) {
  return { checks, findings, decisions };
}

test("score: weights 10/4/1 over applicable checks; skipped and uncertain are left out", () => {
  const cat = catalog(entry("a.b", "blocker"), entry("a.i", "important"), entry("a.p", "polish"), entry("a.s", "blocker"), entry("a.u", "blocker"));
  const st = stateWith(
    { "a.b": { status: "pass" }, "a.i": { status: "fail" }, "a.p": { status: "pass" }, "a.s": { status: "skip" }, "a.u": { status: "uncertain" } },
    { f1: { checkId: "a.i", status: "open" } },
  );
  const r = summarize(cat, st);
  assert.equal(r.score, Math.round((100 * 11) / 15));
  assert.equal(r.verdict, "Almost");
  assert.deepEqual([r.counts.important, r.counts.passed, r.counts.skipped, r.counts.uncertain], [1, 2, 1, 1]);
});

test("score: an open blocker caps at 69 and means Not ready", () => {
  const cat = catalog(entry("a.b", "blocker"), ...Array.from({ length: 30 }, (_, i) => entry(`a.p${i}`, "important")));
  const checks = Object.fromEntries([["a.b", { status: "fail" }], ...Array.from({ length: 30 }, (_, i) => [`a.p${i}`, { status: "pass" }])]);
  const r = summarize(cat, stateWith(checks, { f: { checkId: "a.b", status: "open" } }));
  assert.equal(r.score, 69);
  assert.equal(r.verdict, "Not ready");
});

test("score: accepted counts as failing but doesn't block; muted is left out entirely", () => {
  const cat = catalog(entry("a.b", "blocker"), entry("mail.x", "blocker"), entry("a.i", "important"));
  const checks = { "a.b": { status: "fail" }, "mail.x": { status: "fail" }, "a.i": { status: "pass" } };
  const findings = { f1: { checkId: "a.b", status: "accepted" }, f2: { checkId: "mail.x", status: "open" } };
  const muted = summarize(cat, stateWith(checks, findings, [{ scope: "category", target: "mail", action: "mute" }]));
  assert.equal(muted.score, Math.round((100 * 4) / 14));
  assert.equal(muted.verdict, "Almost");
  assert.deepEqual([muted.counts.accepted, muted.counts.muted, muted.counts.blocker], [1, 1, 0]);
});

test("score: nothing to count is null, not 0 or 100", () => {
  assert.deepEqual(summarize(catalog(), stateWith({})).score, null);
  assert.equal(summarize(catalog(), stateWith({})).verdict, "No checks yet");
});

test("score: 85 and no open blockers is Ready", () => {
  const cat = catalog(entry("a.a", "important"), ...Array.from({ length: 6 }, (_, i) => entry(`a.p${i}`, "important")));
  const checks = Object.fromEntries([["a.a", { status: "fail" }], ...Array.from({ length: 6 }, (_, i) => [`a.p${i}`, { status: "pass" }])]);
  const r = summarize(cat, stateWith(checks, { f: { checkId: "a.a", status: "deferred" } }));
  assert.equal(r.score, 86);
  assert.equal(r.verdict, "Ready");
});
