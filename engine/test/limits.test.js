import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { launchBrowser } from "../src/browser.js";
import { findScanServer, startScanServer, stopScanServer } from "../src/scan-server.js";
import { serveFixture } from "./helpers/serve.js";

// a 1×1 PNG
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

let dir;
let site;
let browser;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sofia-limits-"));
  await writeFile(path.join(dir, "dot.png"), PIXEL);
  for (const name of ["a", "b", "c", "d", "e"]) await writeFile(path.join(dir, `${name}.html`), `<!doctype html><title>${name}</title><img id="i" src="dot.png">`);
  site = await serveFixture(dir);
  browser = await launchBrowser({ maxOpen: 2 });
});

after(async () => {
  await browser?.close();
  await site?.close();
  await rm(dir, { recursive: true, force: true });
});

const url = (name) => new URL(`${name}.html`, site.url).href;

test("Chrome never has more pages open than the limit: a third waits until one is let go", async () => {
  const one = browser.lease();
  const two = browser.lease();
  await one.open(url("a"), { width: 1280 });
  await two.open(url("b"), { width: 1280 });
  let ran = false;
  const third = browser.fresh(url("c"), { width: 1280 }, async () => (ran = true));
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(ran, false, "both pages are in use, so the third has to wait");
  one.release();
  await third;
  assert.equal(ran, true);
  two.release();
});

test("a page that's let go but not needed stays open for the next check that wants it", async () => {
  const one = browser.lease();
  const first = await one.open(url("a"), { width: 1280 });
  one.release();
  const again = browser.lease();
  assert.equal(await again.open(url("a"), { width: 1280 }), first);
  again.release();
});

test("reading a page doesn't load its images, and doesn't count them as broken; checks see the full page", async () => {
  const reader = browser.lease();
  const read = await reader.open(url("a"), { width: 1280, readOnly: true });
  assert.equal(await read.evaluate(() => document.getElementById("i").naturalWidth), 0);
  assert.deepEqual(read.log.failed, []);
  const full = await reader.open(url("a"), { width: 1280 });
  assert.equal(await full.evaluate(() => document.getElementById("i").naturalWidth), 1);
  reader.release();
});

test("the scan server answers who it is, can be found and stopped, and stops itself when idle", async () => {
  let idle = false;
  const server = await startScanServer({ catalog: {}, checks: {}, port: 0, idleMs: 300, onIdle: () => (idle = true) });
  const port = new URL(server.url).port;
  assert.deepEqual(await findScanServer(port), { url: server.url, pid: process.pid });
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(idle, true);
  await server.close();
  assert.equal(await findScanServer(port), null);
  assert.equal(await stopScanServer(port), null, "nothing to stop");
});

test("checks that want the same page share one load, and the page most of them wait for loads first", async () => {
  // both slots busy: everything after this waits its turn
  const one = browser.lease();
  const two = browser.lease();
  await one.open(url("a"), { width: 390 });
  await two.open(url("b"), { width: 390 });
  const before = browser.stats().loads;
  const order = [];
  const lone = browser.lease();
  const many = [browser.lease(), browser.lease(), browser.lease()];
  const waits = [
    lone.open(url("d"), { width: 390 }).then(() => order.push("d")),
    ...many.map((l) => l.open(url("e"), { width: 390 }).then(() => order.push("e"))),
  ];
  one.release();
  await Promise.all(waits.slice(1));
  two.release();
  await waits[0];
  assert.deepEqual(order, ["e", "e", "e", "d"], "three checks wait for e, one for d");
  assert.equal(browser.stats().loads - before, 2, "e is loaded once for all three");
  for (const l of [lone, ...many]) l.release();
});

test("every check that opens pages of its own is marked isolated, so it never runs beside the others", async () => {
  const dir = new URL("../src/checks/", import.meta.url);
  for (const area of await readdir(dir, { withFileTypes: true })) {
    if (!area.isDirectory()) continue;
    for (const file of await readdir(new URL(`${area.name}/`, dir))) {
      const source = await readFile(new URL(`${area.name}/${file}`, dir), "utf8");
      const ownPages = /\.fresh\(|newContext\(|onSlowPhone\(/.test(source);
      assert.equal(/^  isolated: true,/m.test(source), ownPages, `${area.name}/${file}`);
    }
  }
});
