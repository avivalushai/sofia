import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { copyFixture, FIXTURES, serveFixture } from "./helpers/serve.js";
import { loadCatalog, loadChecks } from "../src/catalog.js";
import { validateState } from "../src/state.js";

const BIN = fileURLToPath(new URL("../bin/launch-check.js", import.meta.url));
const exec = promisify(execFile);
const expected = JSON.parse(await readFile(path.join(FIXTURES, "broken-landing", "expected.json"), "utf8"));
const catalog = await loadCatalog();
const { implemented } = await loadChecks(catalog);

let dir;
let site;
const runs = [];

async function engine(...args) {
  const started = Date.now();
  const { stdout, stderr } = await exec(process.execPath, [BIN, "run", "--target", site.url, "--json", ...args], { cwd: dir });
  const state = JSON.parse(await readFile(path.join(dir, ".launch-check", "state.json"), "utf8"));
  return { out: JSON.parse(stdout), stderr, state, ms: Date.now() - started };
}

/** Findings without the parts that legitimately differ between runs. */
const stable = (findings) =>
  Object.fromEntries(Object.entries(findings).map(([id, { lastSeenRun, firstSeenRun, history, ...f }]) => [id, f]));

before(async () => {
  dir = await copyFixture("broken-landing");
  site = await serveFixture(dir);
  runs.push(await engine("--mode", "quick"));
  runs.push(await engine("--mode", "quick"));
});

after(async () => {
  await site.close();
  await rm(dir, { recursive: true, force: true });
});

test("no check crashed", () => {
  assert.deepEqual(runs[0].out.errors, []);
  assert.equal(runs[0].stderr, "");
});

test("detected facts match expected.json", () => {
  const detected = Object.fromEntries(Object.entries(runs[0].state.project.detected).map(([k, v]) => [k, v.value]));
  assert.deepEqual(detected, expected.detected);
  for (const [fact, v] of Object.entries(runs[0].state.project.detected)) assert.ok(v.why, `${fact} has no reason`);
});

test("every implemented check has a row in expected.json", () => {
  const rows = new Set(expected.expect.map((r) => r.checkId));
  const missing = implemented.map((c) => c.id).filter((id) => !rows.has(id));
  assert.deepEqual(missing, [], `add rows to expected.json for: ${missing.join(", ")}`);
});

for (const row of expected.expect) {
  const check = implemented.find((c) => c.id === row.checkId);
  test(`${row.checkId} → ${row.status}`, { skip: check ? (check.entry.layer !== "mechanical" && "browser layer runs from M2") : "not built yet" }, () => {
    const actual = runs[0].state.checks[row.checkId];
    assert.ok(actual, "check didn't run");
    assert.equal(actual.status, row.status, `${row.note ?? ""}${actual.reason ? ` (reason: ${actual.reason})` : ""}`);
  });
}

test("findings land on the right pages and lines", () => {
  const f = runs[0].state.findings;
  const where = (checkId) => Object.values(f).filter((x) => x.checkId === checkId).map((x) => x.location);
  assert.deepEqual(where("a11y.lang").map((l) => l.url), ["/"], "index only; pricing.html has lang");
  assert.deepEqual(where("content.copyright-year").map((l) => [l.url, l.file]), [["/", "index.html"], ["/pricing.html", "pricing.html"]]);
  assert.deepEqual(where("seo.title").map((l) => l.url), ["/", "/pricing.html"]);
  assert.deepEqual(where("sec.client-secrets").map((l) => [l.file, l.line]), [["assets/app.js", 4]]);
  assert.deepEqual(where("env.localhost-urls").map((l) => [l.file, l.line]), [["assets/app.js", 7]]);
  assert.deepEqual(where("sec.debug-logs").map((l) => [l.file, l.line]), [["assets/app.js", 14]]);
  assert.deepEqual(where("content.placeholders").map((l) => [l.url, l.file, l.line]), [["/", "index.html", 22]]);
});

test("the secret is never written out in full", () => {
  const text = JSON.stringify(runs[0].state);
  assert.ok(!text.includes("sk_live_FAKEFAKEFAKEFAKEFAKE0000"));
});

test("state.json is valid and the score follows the rules", () => {
  const { state } = runs[0];
  assert.deepEqual(validateState(state), []);
  const run = state.runs[0];
  assert.equal(run.verdict, "Not ready");
  assert.ok(run.score <= 69, "an open blocker caps the score at 69");
  assert.equal(run.counts.notImplemented, catalog.checks.length - implemented.length);
});

test("two consecutive runs produce identical findings", () => {
  assert.deepEqual(stable(runs[1].state.findings), stable(runs[0].state.findings));
  const checks = (s) => Object.fromEntries(Object.entries(s.checks).map(([id, { lastRun, ...c }]) => [id, c]));
  assert.deepEqual(checks(runs[1].state), checks(runs[0].state));
  assert.deepEqual(runs[1].state.runs[1].changes, { new: [], fixed: [], reopened: [] });
  assert.equal(runs[1].state.runs[1].score, runs[0].state.runs[0].score);
});

test("quick mode finishes in under 10 seconds", () => {
  assert.ok(runs[0].ms < 10_000, `took ${runs[0].ms} ms`);
});

test("report.md is written with the six parts", async () => {
  const report = await readFile(path.join(dir, ".launch-check", "report.md"), "utf8");
  assert.match(report, /## \d+ \/ 100 · Not ready/);
  assert.match(report, /\*\*Where:\*\* `assets\/app\.js` line 7/);
  assert.match(report, /\*\*Found:\*\*/);
  assert.match(report, /\*\*Fix \(I'll fix this\):\*\*/);
  assert.match(report, /`sec\.client-secrets`/);
  assert.match(report, /## Skipped/);
});

test("fixing the page and re-running marks the finding fixed and raises the score", async () => {
  const file = path.join(dir, "index.html");
  const html = await readFile(file, "utf8");
  await writeFile(file, html.replace('<html dir="rtl">', '<html lang="he" dir="rtl">'));
  try {
    const { state } = await engine("--mode", "quick");
    const run = state.runs.at(-1);
    assert.equal(state.checks["a11y.lang"].status, "pass");
    assert.equal(state.findings["f_a11y.lang_home"].status, "fixed");
    assert.deepEqual(run.changes.fixed, ["f_a11y.lang_home"]);
    assert.deepEqual(state.findings["f_a11y.lang_home"].history.map((h) => h.event), ["opened", "fixed"]);

    await writeFile(file, html);
    const again = await engine("--mode", "quick");
    assert.equal(again.state.findings["f_a11y.lang_home"].status, "open");
    assert.deepEqual(again.state.runs.at(-1).changes.reopened, ["f_a11y.lang_home"]);
  } finally {
    await writeFile(file, html);
  }
});
