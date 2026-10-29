// broken-app has one planted problem for each check in its expected.json; clean-app is the same app
// with all of them fixed, so every one of its rows must pass. Rows are added as checks are built.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { copyFixture, FIXTURES, serveFixture } from "./helpers/serve.js";

const BIN = fileURLToPath(new URL("../bin/launch-check.js", import.meta.url));
const exec = promisify(execFile);
const APPS = ["broken-app", "clean-app"];
const expected = Object.fromEntries(await Promise.all(APPS.map(async (a) => [a, JSON.parse(await readFile(path.join(FIXTURES, a, "expected.json"), "utf8"))])));
const results = {};
const cleanup = [];

before(async () => {
  await Promise.all(APPS.map(async (app) => {
    const dir = await copyFixture(app);
    const site = await serveFixture(dir);
    cleanup.push(async () => (await site.close(), await rm(dir, { recursive: true, force: true })));
    const only = expected[app].expect.map((r) => r.checkId).join(",");
    const { stdout } = await exec(process.execPath, [BIN, "run", "--target", site.url, "--mode", "full", "--only", only, "--json"], { cwd: dir });
    results[app] = { out: JSON.parse(stdout), state: JSON.parse(await readFile(path.join(dir, ".launch-check", "state.json"), "utf8")) };
  }));
});

after(async () => {
  for (const c of cleanup) await c();
});

for (const app of APPS) {
  test(`${app}: no check crashed, facts as expected`, () => {
    assert.deepEqual(results[app].out.errors, []);
    for (const [fact, v] of Object.entries(expected[app].detected)) assert.equal(results[app].state.project.detected[fact].value, v, fact);
  });
  for (const row of expected[app].expect) {
    test(`${app}: ${row.checkId} → ${row.status}`, () => {
      const actual = results[app].state.checks[row.checkId];
      assert.ok(actual, "check didn't run");
      const findings = Object.values(results[app].state.findings).filter((f) => f.checkId === row.checkId && f.status !== "fixed");
      assert.equal(actual.status, row.status, `${row.note ?? ""}${actual.reason ? ` (reason: ${actual.reason})` : ""}${findings.length ? ` — ${findings.map((f) => f.evidence).join(" | ")}` : ""}`);
    });
  }
}
