import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { copyFixture, serveFixture } from "./helpers/serve.js";
import { validateState } from "../src/state.js";

const BIN = fileURLToPath(new URL("../bin/launch-check.js", import.meta.url));
const exec = promisify(execFile);

/** Runs the CLI as a user would, in `cwd`. Resolves even on non-zero exit. */
async function cli(cwd, ...args) {
  try {
    const { stdout, stderr } = await exec(process.execPath, [BIN, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

let site;
let project;

before(async () => {
  site = await serveFixture("broken-landing");
  project = await mkdtemp(path.join(tmpdir(), "launch-check-"));
});

after(async () => {
  await site.close();
  await rm(project, { recursive: true, force: true });
});

test("harness serves the fixture, with a default 404", async () => {
  const home = await fetch(site.url);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<html/i);
  assert.equal((await fetch(new URL("about.html", site.url))).status, 404);
});

test("run against the fixture writes a valid state.json", async () => {
  const { code, stdout, stderr } = await cli(project, "run", "--target", site.url, "--json");
  assert.equal(code, 0, stderr);

  const out = JSON.parse(stdout);
  assert.equal(out.implemented.length + out.notImplemented.length, 167);
  assert.equal(out.catalogSize, 167);

  const state = JSON.parse(await readFile(path.join(project, ".launch-check", "state.json"), "utf8"));
  assert.deepEqual(validateState(state), []);
  assert.equal(state.runs.length, 1);
  const [run] = state.runs;
  assert.equal(run.target, site.url);
  assert.equal(run.mode, "full");
  assert.equal(run.counts.notImplemented, out.notImplemented.length);
  assert.ok(Object.keys(state.findings).length > 0);
});

test("a second run appends with a distinct id", async () => {
  const { code, stderr } = await cli(project, "run", "--target", site.url, "--mode", "quick");
  assert.equal(code, 0, stderr);
  const state = JSON.parse(await readFile(path.join(project, ".launch-check", "state.json"), "utf8"));
  assert.deepEqual(validateState(state), []);
  assert.equal(state.runs.length, 2);
  assert.notEqual(state.runs[0].id, state.runs[1].id);
  assert.equal(state.runs[1].mode, "quick");
});

test("unreachable target fails clearly and writes nothing", async () => {
  const empty = await mkdtemp(path.join(tmpdir(), "launch-check-"));
  try {
    const { code, stderr } = await cli(empty, "run", "--target", "http://127.0.0.1:1/");
    assert.equal(code, 1);
    assert.match(stderr, /Couldn't reach/);
    await assert.rejects(readFile(path.join(empty, ".launch-check", "state.json")));
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});

test("bad usage exits 2 with a plain message", async () => {
  assert.equal((await cli(project, "run")).code, 2);
  assert.equal((await cli(project, "run", "--target", "ftp://x")).code, 2);
  assert.equal((await cli(project, "run", "--target", site.url, "--mode", "slow")).code, 2);
  assert.equal((await cli(project, "run", "--target", site.url, "--consent", "buy-things")).code, 2);
});

test("--target local serves a plain HTML project itself and stops afterwards", async () => {
  const dir = await copyFixture("broken-landing");
  try {
    const { code, stdout, stderr } = await cli(dir, "run", "--target", "local", "--mode", "quick", "--json");
    assert.equal(code, 0, stderr);
    const out = JSON.parse(stdout);
    assert.equal(out.local.how, "served the project folder");
    assert.equal(out.run.pages, 2);
    await assert.rejects(fetch(out.local.url), "the local server is stopped after the run");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--target local runs the project's dev script on a free port and stops it afterwards", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lc-devscript-"));
  try {
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "x", private: true, scripts: { dev: "node server.js" } }));
    await writeFile(path.join(dir, "server.js"), `require("http").createServer((q, s) => s.writeHead(200, {"content-type":"text/html"}).end("<!doctype html><html lang=en><title>Dev</title><body><p>Hello from the dev server</p></body></html>")).listen(process.env.PORT, () => console.log("ready on http://localhost:" + process.env.PORT));`);
    const { code, stdout, stderr } = await cli(dir, "run", "--target", "local", "--mode", "quick", "--json");
    assert.equal(code, 0, stderr);
    const out = JSON.parse(stdout);
    assert.equal(out.local.how, "npm run dev");
    await new Promise((r) => setTimeout(r, 500));
    await assert.rejects(fetch(out.local.url), "the dev server is stopped after the run");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
