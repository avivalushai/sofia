import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalHost } from "./lib/net.js";
import { pageData, UI_DIR } from "./report-html.js";
import { parseTarget, scanSite } from "./runner.js";
import { emptyState, mergeRun, readState, STATE_DIR } from "./state.js";
import { refreshCurrent } from "./summary.js";

const SITE_DIR = fileURLToPath(new URL("../../site/", import.meta.url));
const TYPES = { ".woff2": "font/woff2", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp" };
const MAX_BODY = 2048;
export const SCAN_SERVER_PORT = 4331;
const APP = "sofia-scan-server";
const IDLE_MS = 30 * 60 * 1000;

/** The scan server already answering on this port, if any. @returns {Promise<{ url: string, pid: number } | null>} */
export async function findScanServer(port = SCAN_SERVER_PORT) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(1500) });
    const body = await res.json();
    return body.app === APP ? { url: `http://127.0.0.1:${port}/`, pid: body.pid } : null;
  } catch {
    return null;
  }
}

/** Stops the scan server on this port and waits until it's gone. @returns {Promise<number | null>} its process id, null if none ran */
export async function stopScanServer(port = SCAN_SERVER_PORT) {
  const found = await findScanServer(port);
  if (!found) return null;
  try {
    process.kill(found.pid, "SIGTERM");
  } catch {}
  for (let i = 0; i < 60 && (await findScanServer(port)); i++) await new Promise((r) => setTimeout(r, 100));
  return found.pid;
}

/** "my-site.com" → "https://my-site.com/". @returns {string} or throws a message for the visitor */
export function parseAddress(text, { allowLocal = false } = {}) {
  const raw = String(text ?? "").trim();
  if (!raw) throw new Error("Type your site's address first");
  const target = parseTarget(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (target === "local") throw new Error("Type your site's address, like my-site.com");
  const { hostname } = new URL(target);
  if (!allowLocal && (isLocalHost(hostname) || !hostname.includes("."))) throw new Error("That isn't a public address. Type one like my-site.com");
  return target;
}

/**
 * The landing page and its scans, on this machine only: it's for trying the flow, not for the public
 * yet (no protection from abuse). One scan runs at a time, the rest wait in line.
 * onIdle is called after idleMs with no visits and no scan running or waiting.
 * @param {{ catalog: any, checks: any, port?: number, maxPages?: number, allowLocal?: boolean, scan?: typeof scanSite, idleMs?: number, onIdle?: () => void }} o
 */
export async function startScanServer({ catalog, checks, port = SCAN_SERVER_PORT, maxPages = 30, allowLocal = false, scan = scanSite, idleMs = IDLE_MS, onIdle = null }) {
  const jobs = new Map();
  const line = [];
  let running = false;
  let lastActivity = Date.now();

  async function next() {
    if (running || !line.length) return;
    running = true;
    const job = line.shift();
    job.status = "running";
    job.phase = "opening";
    job.startedAt = new Date().toISOString();
    try {
      // the report is titled after this folder
      const root = path.join(await mkdtemp(path.join(tmpdir(), "sofia-scan-")), new URL(job.target).hostname);
      await mkdir(root);
      job.root = root;
      const result = await scan({
        root, target: job.target, maxPages, catalog, checks,
        onProgress: (message) => {
          if (/^Reading/.test(message)) Object.assign(job, { phase: "reading", pagesRead: Number(message.match(/(\d+) so far/)?.[1] ?? 0) });
          else if (/^Read the/.test(message)) job.phase = "checking";
        },
        onCheck: ({ id, title, done, total, found, result }) => {
          Object.assign(job, { current: title, currentId: id, done, total });
          if (job.phase === "opening") job.phase = "checking";
          if (found) job.found.push(found);
          if (result) job.results.push(result);
        },
      });
      const { blocker, important, polish, passed } = result.run.counts;
      Object.assign(job, { status: "done", reportFile: result.report, pages: result.run.pages, counts: { blocker, important, polish, passed } });
    } catch (err) {
      Object.assign(job, { status: "failed", error: err.message });
    }
    running = false;
    lastActivity = Date.now();
    next();
  }

  /**
   * What the report page shows. While a scan runs: the checks finished so far, without screenshots
   * (they're saved at the end). Once it's done: the saved results.
   */
  async function reportData(job) {
    const host = new URL(job.target).hostname;
    if (job.status === "done") return { ...pageData(catalog, await readState(job.root), job.root), scan: view(job) };
    if (job.live?.done === job.results.length) return { ...job.live.data, scan: view(job) };
    const state = emptyState();
    const at = new Date().toISOString();
    const results = job.results.map((r) => ({ ...r, items: r.items.map(({ shot: _shot, location = {}, ...i }) => ({ ...i, shot: null, location: { url: location.url, viewport: location.viewport } })) }));
    mergeRun(state, { runId: "live", at, results, scannedPaths: { has: () => true } });
    state.runs.push({ id: "live", kind: "scan", mode: "full", siteOnly: true, target: job.target, startedAt: job.startedAt ?? at, finishedAt: at });
    refreshCurrent(catalog, state, at);
    const data = pageData(catalog, state, host);
    job.live = { done: job.results.length, data };
    return { ...data, scan: view(job) };
  }

  const view = (job) => ({
    status: job.status,
    host: new URL(job.target).hostname,
    phase: job.phase ?? null,
    current: job.current ?? null,
    currentId: job.currentId ?? null,
    done: job.done ?? 0,
    total: job.total ?? 0,
    found: job.found,
    pagesRead: job.pagesRead ?? 0,
    ahead: job.status === "waiting" ? line.indexOf(job) + (running ? 1 : 0) : 0,
    report: `/reports/${job.id}/`,
    ...(job.status === "done" ? { pages: job.pages, counts: job.counts } : {}),
    ...(job.error ? { error: job.error } : {}),
  });

  const server = createServer(async (req, res) => {
    lastActivity = Date.now();
    const { pathname } = new URL(req.url, "http://localhost");
    const json = (status, body) => res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(body));
    const file = async (f) => {
      try {
        const content = await readFile(f);
        res.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream", "cache-control": "no-store" }).end(content);
      } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      }
    };

    if (pathname === "/api/scan" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > MAX_BODY) return json(413, { error: "That address is too long" });
      }
      let target;
      try {
        target = parseAddress(JSON.parse(body).url, { allowLocal });
      } catch (err) {
        return json(400, { error: err instanceof SyntaxError ? "Type your site's address first" : err.message });
      }
      const id = randomBytes(12).toString("hex");
      const job = { id, target, status: "waiting", found: [], results: [] };
      jobs.set(id, job);
      line.push(job);
      next();
      return json(202, { id });
    }
    if (pathname === "/api/scan" && req.method === "GET") return json(200, { ready: true });
    if (pathname === "/api/ping") return json(200, { app: APP, pid: process.pid });
    const scanId = pathname.match(/^\/api\/scan\/([a-f0-9]+)$/)?.[1];
    if (scanId) return jobs.has(scanId) ? json(200, view(jobs.get(scanId))) : json(404, { error: "No such scan" });
    // a scan's report page: the report app, fed with that scan's results as they come
    const report = pathname.match(/^\/reports\/([a-f0-9]+)(\/.*)?$/);
    if (report) {
      const [, id, rest] = report;
      const job = jobs.get(id);
      if (!rest) return res.writeHead(302, { location: `/reports/${id}/` }).end();
      if (rest === "/api/state") return job ? json(200, await reportData(job)) : json(404, { error: "This check isn't here any more" });
      if (rest === "/report.html") return file(job?.reportFile ?? "");
      if (rest.startsWith("/shots/")) {
        const base = job?.root ? path.join(job.root, STATE_DIR, "shots") + path.sep : null;
        const shot = base && path.resolve(job.root, STATE_DIR, decodeURIComponent(rest.slice(1)));
        return shot?.startsWith(base) ? file(shot) : res.writeHead(404).end();
      }
      const ui = path.resolve(UI_DIR, decodeURIComponent(rest.slice(1)) || "index.html");
      return ui.startsWith(UI_DIR) ? file(ui) : res.writeHead(404).end();
    }

    // the landing page itself; anything outside its folder is refused
    const rel = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
    const full = path.resolve(SITE_DIR, rel);
    if (!full.startsWith(SITE_DIR)) return res.writeHead(404).end();
    return file(full);
  });
  await new Promise((resolve, reject) => {
    server.once("error", (err) => reject(err.code === "EADDRINUSE" ? new Error(`Port ${port} is already used by another program. Close it, or stop the scan server with: launch-check scan-server --stop`) : err));
    server.listen(port, "127.0.0.1", resolve);
  });
  const idle = onIdle && setInterval(() => {
    if (!running && !line.length && Date.now() - lastActivity > idleMs) onIdle();
  }, Math.min(30_000, idleMs)).unref();
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => {
      clearInterval(idle);
      server.closeAllConnections?.();
      return new Promise((r) => server.close(r));
    },
  };
}
