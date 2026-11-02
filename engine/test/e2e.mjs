#!/usr/bin/env node
/**
 * One whole site scan through the scan server, against a fixture served on this machine:
 *   npm run e2e [-- <fixture>]     (default clean-app)
 * Prints progress and the counts. It always ends, and takes its Chrome and servers with it: when the
 * scan finishes or fails, on Ctrl-C or kill, after TIMEOUT_MS, and when whoever started it goes away.
 */
import { loadCatalog, loadChecks } from "../src/catalog.js";
import { startScanServer } from "../src/scan-server.js";
import { onStop, stopNow, stopping, stopOnSignals, stopWithParent } from "../src/lib/stop.js";
import { serveFixture } from "./helpers/serve.js";

// with two Chrome pages at a time, a 9-page site takes about 7 minutes
const TIMEOUT_MS = 15 * 60 * 1000;

stopOnSignals();
stopWithParent();
setTimeout(() => {
  console.error(`Gave up after ${TIMEOUT_MS / 60_000} minutes`);
  stopNow(1);
}, TIMEOUT_MS).unref();

try {
  const site = await serveFixture(process.argv[2] ?? "clean-app");
  onStop(site.close);
  const catalog = await loadCatalog();
  const server = await startScanServer({ catalog, checks: await loadChecks(catalog), port: 0, allowLocal: true });
  onStop(server.close);

  const t0 = Date.now();
  const { id } = await (await fetch(new URL("/api/scan", server.url), { method: "POST", body: JSON.stringify({ url: site.url }) })).json();
  let last = "";
  for (;;) {
    const s = await (await fetch(new URL(`/api/scan/${id}`, server.url))).json();
    const line = `${s.status} ${s.phase} pages=${s.pagesRead} ${s.done}/${s.total}`;
    if (line !== last) console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`), (last = line);
    if (s.status === "done" || s.status === "failed") {
      console.log(s.error ?? JSON.stringify(s.counts));
      await stopNow(s.status === "done" ? 0 : 1);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
} catch (err) {
  if (!stopping()) console.error(err); // after a stop the server is gone, so the next poll fails
  await stopNow(1);
}
