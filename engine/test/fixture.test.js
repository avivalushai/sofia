import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, rm, writeFile } from "node:fs/promises";
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
let quick;
const runs = [];
const FULL = ["--mode", "full", "--consent", "submit-forms"];

async function engine(where, ...args) {
  const started = Date.now();
  const { stdout, stderr } = await exec(process.execPath, [BIN, "run", "--target", where.url, "--json", ...args], { cwd: where.dir });
  const state = JSON.parse(await readFile(path.join(where.dir, ".launch-check", "state.json"), "utf8"));
  return { out: JSON.parse(stdout), stderr, state, ms: Date.now() - started };
}

async function fixtureCopy() {
  const d = await copyFixture("broken-landing");
  const s = await serveFixture(d);
  return { dir: d, url: s.url, close: async () => (await s.close(), await rm(d, { recursive: true, force: true })) };
}

/** Findings without the parts that legitimately differ between runs. */
const stable = (findings) =>
  Object.fromEntries(Object.entries(findings).map(([id, { lastSeenRun, firstSeenRun, history, ...f }]) => [id, f]));

before(async () => {
  const q = await fixtureCopy();
  quick = await engine(q, "--mode", "quick");
  await q.close();
  site = await fixtureCopy();
  dir = site.dir;
  runs.push(await engine(site, ...FULL));
  runs.push(await engine(site, ...FULL));
});

after(async () => {
  await site.close();
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
  test(`${row.checkId} → ${row.status}`, { skip: check ? false : "not built yet" }, () => {
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

test("each visual failure has a before.png with the element highlighted", async () => {
  const VISUAL = /^(resp\.|design\.(palette|font-families|button-families)|rtl\.(components|font)|a11y\.(contrast|form-labels|button-names)|qa\.(dead-buttons|broken-links|custom-404))/;
  const visual = Object.entries(runs[0].state.findings).filter(([, f]) => VISUAL.test(f.checkId) && f.status === "open");
  assert.ok(visual.length >= 8, `only ${visual.length} visual findings`);
  for (const [id, f] of visual) {
    assert.equal(f.shots.before, `shots/${id}/before.png`, id);
    const png = await readFile(path.join(dir, ".launch-check", f.shots.before));
    assert.equal(png.subarray(1, 4).toString(), "PNG", id);
    if (f.checkId !== "qa.custom-404") assert.ok(f.location.selector, `${id} has no element to highlight`);
  }
});

test("the right element is blamed for sideways scrolling, at 375 and 390 only", () => {
  const f = Object.values(runs[0].state.findings).filter((x) => x.checkId === "resp.no-horizontal-scroll");
  assert.deepEqual(f.map((x) => [x.location.url, x.location.viewport, x.location.selector]), [["/", 375, "section.pricing"], ["/", 390, "section.pricing"]]);
  assert.deepEqual([f[0].location.file, f[0].location.line], ["assets/style.css", 9]);
});

test("form checks wait for consent", async () => {
  const other = await fixtureCopy();
  try {
    const { state } = await engine(other, "--mode", "full", "--only", "forms,behave");
    for (const id of ["forms.success-truth", "forms.destination", "forms.validation", "behave.double-submit"]) {
      assert.equal(state.checks[id].status, "skip", id);
      assert.equal(state.checks[id].needs, "submit-forms", id);
    }
  } finally {
    await other.close();
  }
});

test("full mode finishes in under 2 minutes", () => {
  assert.ok(runs[0].ms < 120_000, `took ${runs[0].ms} ms`);
});

test("two consecutive runs produce identical findings", () => {
  assert.deepEqual(stable(runs[1].state.findings), stable(runs[0].state.findings));
  const checks = (s) => Object.fromEntries(Object.entries(s.checks).map(([id, { lastRun, ...c }]) => [id, c]));
  assert.deepEqual(checks(runs[1].state), checks(runs[0].state));
  assert.deepEqual(runs[1].state.runs[1].changes, { new: [], fixed: [], reopened: [] });
  assert.equal(runs[1].state.runs[1].score, runs[0].state.runs[0].score);
});

test("quick mode finishes in under 10 seconds and runs only mechanical checks", () => {
  assert.ok(quick.ms < 10_000, `took ${quick.ms} ms`);
  assert.ok(quick.out.ran.every((r) => r.layer === "mechanical"));
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

test("fixing the site and re-running marks findings fixed, saves after.png, and reopens if it comes back", async () => {
  const html = path.join(dir, "index.html");
  const css = path.join(dir, "assets", "style.css");
  const [origHtml, origCss] = await Promise.all([readFile(html, "utf8"), readFile(css, "utf8")]);
  await writeFile(html, origHtml.replace('<html dir="rtl">', '<html lang="he" dir="rtl">'));
  await writeFile(css, origCss.replace("width: 420px;", "max-width: 420px; flex-wrap: wrap;"));
  try {
    const { state } = await engine(site, ...FULL);
    const run = state.runs.at(-1);
    const prev = state.runs.at(-2);
    assert.equal(state.checks["a11y.lang"].status, "pass");
    assert.equal(state.checks["resp.no-horizontal-scroll"].status, "pass");
    for (const id of ["f_a11y.lang_home", "f_resp.no-horizontal-scroll_home_375", "f_resp.no-horizontal-scroll_home_390"]) {
      assert.equal(state.findings[id].status, "fixed", id);
      assert.ok(run.changes.fixed.includes(id), id);
    }
    assert.ok(run.score > prev.score || run.score === 69, `${prev.score} → ${run.score}`);
    const scroll = state.findings["f_resp.no-horizontal-scroll_home_375"];
    assert.equal(scroll.shots.after, "shots/f_resp.no-horizontal-scroll_home_375/after.png");
    await access(path.join(dir, ".launch-check", scroll.shots.after));

    await writeFile(css, origCss);
    const again = await engine(site, ...FULL, "--only", "resp.no-horizontal-scroll");
    const back = again.state.findings["f_resp.no-horizontal-scroll_home_375"];
    assert.equal(back.status, "open");
    assert.equal(back.shots.after, null, "a finding that's back has no after shot");
    assert.ok(again.state.runs.at(-1).changes.reopened.includes("f_resp.no-horizontal-scroll_home_375"));
  } finally {
    await writeFile(html, origHtml);
    await writeFile(css, origCss);
  }
});
