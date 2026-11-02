import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { serveFixture } from "./helpers/serve.js";

const BIN = fileURLToPath(new URL("../bin/launch-check.js", import.meta.url));
const exec = promisify(execFile);
const lc = (cwd, ...args) => exec(process.execPath, [BIN, ...args], { cwd, maxBuffer: 50 * 1024 * 1024 });
const readJson = async (f) => JSON.parse(await readFile(f, "utf8"));

let site;
let cwd;
let state;
let out;

before(async () => {
  site = await serveFixture("broken-landing");
  cwd = await mkdtemp(path.join(tmpdir(), "sofia-scan-"));
  // a folder with its own code: a site scan must not read it
  await writeFile(path.join(cwd, "package.json"), JSON.stringify({ dependencies: { stripe: "1.0.0" } }));
  const r = await lc(cwd, "scan", site.url, "--out", "result", "--json").catch((e) => e);
  out = JSON.parse(r.stdout);
  state = await readJson(path.join(cwd, "result", ".launch-check", "state.json"));
});

after(async () => {
  await site.close();
  await rm(cwd, { recursive: true, force: true });
});

test("a site scan runs the checks that need only an address, and says why the others didn't run", () => {
  const skipped = (re) => Object.values(state.checks).filter((c) => c.status === "skip" && re.test(c.reason)).length;
  assert.equal(Object.keys(state.checks).length, 167);
  assert.equal(skipped(/reviewer/), 22);
  assert.equal(skipped(/clicks or sends/), 11);
  assert.equal(skipped(/weak spots/), 2);
  assert.equal(skipped(/needs the site's code/), 22);
  assert.ok(state.runs.at(-1).siteOnly);
});

test("a site scan ignores the folder it runs in", () => {
  assert.equal(state.project.detected.shop.value, false);
});

test("forms come from the rendered pages, and findings point at addresses, not files", () => {
  assert.notEqual(state.checks["forms.autocomplete"].status, "skip");
  for (const f of Object.values(state.findings)) assert.ok(!f.location?.file, `${f.checkId} points at ${f.location.file}`);
});

test("the report is one file next to the results", async () => {
  assert.equal(out.report, path.join(await realCwd(), "result", "report.html"));
  assert.ok((await stat(out.report)).size > 1000);
  assert.match(await readFile(out.report, "utf8"), /"siteOnly":true/);
});

test("a normal scan from an empty folder doesn't pass checks that need code", async () => {
  const empty = await mkdtemp(path.join(tmpdir(), "sofia-empty-"));
  await lc(empty, "run", "--target", site.url, "--mode", "quick", "--only", "deps.vulnerable,seo.title").catch((e) => e);
  const st = await readJson(path.join(empty, ".launch-check", "state.json"));
  assert.equal(st.checks["deps.vulnerable"].status, "skip");
  assert.match(st.checks["deps.vulnerable"].reason, /code/);
  assert.notEqual(st.checks["seo.title"].status, "skip");
  await rm(empty, { recursive: true, force: true });
});

test("a site scan refuses anything but a web address", async () => {
  const r = await lc(cwd, "scan", "local").catch((e) => e);
  assert.equal(r.code, 2);
});

async function realCwd() {
  return (await exec(process.execPath, ["-e", "console.log(process.cwd())"], { cwd })).stdout.trim();
}

test("the scan server takes an address, reports progress and hands over the report", async () => {
  const { loadCatalog, loadChecks } = await import("../src/catalog.js");
  const { parseAddress, startScanServer } = await import("../src/scan-server.js");
  assert.equal(parseAddress("my-site.com"), "https://my-site.com/");
  assert.throws(() => parseAddress("http://localhost:3000"), /public address/);
  assert.throws(() => parseAddress("http://192.168.1.4"), /public address/);
  assert.throws(() => parseAddress("ftp://my-site.com"), /http/);

  const catalog = await loadCatalog();
  const scan = async ({ onCheck, onProgress, root }) => {
    onProgress("started");
    const entry = catalog.byId.get("seo.title");
    onCheck({ id: entry.id, title: "A check", done: 1, total: 2, found: { title: "A problem", severity: "important" },
      result: { entry, status: "fail", items: [{ checkId: entry.id, status: "fail", key: "/", title: "A problem", impact: "x", evidence: "y", fix: "z", location: { url: "/", file: "index.html" }, shot: Buffer.from("png") }] } });
    await release;
    const report = path.join(root, "report.html");
    assert.ok(/\.example\.com$/.test(path.basename(root)), "the report is titled after the site");
    await writeFile(report, "<p>the report</p>");
    return { report, run: { pages: 3, counts: { blocker: 1, important: 2, polish: 3, passed: 4 } } };
  };
  let open;
  const release = new Promise((r) => (open = r));
  const server = await startScanServer({ catalog, checks: await loadChecks(catalog), port: 0, scan });
  const api = (p, o) => fetch(new URL(p, server.url), o);
  const post = (url) => api("/api/scan", { method: "POST", body: JSON.stringify({ url }) });
  try {
    assert.equal((await post("localhost")).status, 400);
    const first = (await (await post("one.example.com")).json()).id;
    const second = (await (await post("two.example.com")).json()).id;
    const running = await (await api(`/api/scan/${first}`)).json();
    assert.deepEqual([running.status, running.phase, running.done, running.total, running.current], ["running", "checking", 1, 2, "A check"]);
    assert.deepEqual(running.found, [{ title: "A problem", severity: "important" }]);
    const live = await (await api(`/reports/${first}/api/state`)).json();
    assert.equal(live.scan.status, "running");
    const [finding] = Object.values(live.state.findings);
    assert.deepEqual([finding.title, finding.location.file, finding.shots?.before ?? null], ["A problem", undefined, null]);
    assert.match(await (await api(`/reports/${first}/`)).text(), /id="scanning"/);
    assert.equal((await api(`/reports/${first}/..%2F..%2Fpackage.json`)).status, 404);
    const waiting = await (await api(`/api/scan/${second}`)).json();
    assert.deepEqual([waiting.status, waiting.ahead], ["waiting", 1]);
    open();
    let done;
    while ((done = await (await api(`/api/scan/${first}`)).json()).status !== "done") await new Promise((r) => setTimeout(r, 10));
    assert.equal(done.report, `/reports/${first}/`);
    assert.equal(await (await api(`${done.report}report.html`)).text(), "<p>the report</p>");
    assert.equal(done.counts.blocker, 1);
    assert.match(await (await api("/")).text(), /id="scan-form"/);
    assert.equal((await api("/..%2Fengine%2Fpackage.json")).status, 404);
    assert.equal((await api("/api/scan/ffff")).status, 404);
    assert.equal((await api("/reports/ffff/api/state")).status, 404);
    assert.equal((await api("/favicon.ico")).status, 404);
    assert.match(await (await api("/")).text(), /id="scan-form"/); // still up after the missing files
  } finally {
    await server.close();
  }
});
