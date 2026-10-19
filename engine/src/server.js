import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, rm } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_DIR, readState, statePath } from "./state.js";
import { buildSummary } from "./summary.js";

/** The prebuilt page, shipped with the plugin (docs/05: no build step at install time). */
const UI_DIR = fileURLToPath(new URL("../../ui/dist/", import.meta.url));
const PREFERRED_PORT = 4319;
const IDLE_MS = 30 * 60 * 1000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const serverFile = (root) => path.join(root, STATE_DIR, "server.json");

async function alive(info, root) {
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/api/ping`, { signal: AbortSignal.timeout(1500) });
    const body = await res.json();
    return body.root === root;
  } catch {
    return false;
  }
}

/**
 * The address of this project's report page: reuses a running server, otherwise starts one in the
 * background (docs/02: never a second server or tab for the same project).
 * @returns {Promise<{ url: string, started: boolean }>}
 */
export async function ensureServer(root) {
  try {
    const info = JSON.parse(await readFile(serverFile(root), "utf8"));
    if (await alive(info, root)) return { url: `http://127.0.0.1:${info.port}/`, started: false };
  } catch {}
  const bin = fileURLToPath(new URL("../bin/launch-check.js", import.meta.url));
  const child = spawn(process.execPath, [bin, "serve", "--foreground"], { cwd: root, detached: true, stdio: "ignore" });
  child.unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const info = JSON.parse(await readFile(serverFile(root), "utf8"));
      if (info.pid === child.pid && (await alive(info, root))) return { url: `http://127.0.0.1:${info.port}/`, started: true };
    } catch {}
  }
  throw new Error("The report page didn't start. Run the serve command again to see why.");
}

/**
 * Serves the report page for one project on 127.0.0.1 only:
 *   GET /               the page          GET /api/state   state + summary + catalog
 *   GET /api/events     live updates (Server-Sent Events) on every change to the state file
 *   GET /shots/...      screenshots       GET /api/ping    who this server belongs to
 * Stops itself after 30 minutes with no open page and no changes.
 */
export async function runServer(root, catalog) {
  const clients = new Set();
  let lastActivity = Date.now();
  const checks = catalog.checks.map(({ id, title, category, categoryTitle, layer, severity, fixer, v1, appliesWhen }) => ({ id, title, category, categoryTitle, layer, severity, fixer, v1, appliesWhen }));

  async function stateBody() {
    const state = await readState(root);
    return { state, summary: state.runs.length ? buildSummary(catalog, state) : null, catalog: checks, project: path.basename(root) };
  }

  const server = createServer(async (req, res) => {
    lastActivity = Date.now();
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname === "/api/ping") return json(res, { root, pid: process.pid });
      if (url.pathname === "/api/state") return json(res, await stateBody());
      if (url.pathname === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write("retry: 2000\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (url.pathname.startsWith("/shots/")) {
        const file = path.join(root, STATE_DIR, decodeURIComponent(url.pathname));
        if (!file.startsWith(path.join(root, STATE_DIR, "shots") + path.sep)) return res.writeHead(403).end();
        return send(res, file);
      }
      const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = path.join(UI_DIR, rel);
      if (!file.startsWith(UI_DIR)) return res.writeHead(403).end();
      return send(res, file);
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain" }).end(String(err.message));
    }
  });

  let port = PREFERRED_PORT;
  for (;; port++) {
    const ok = await new Promise((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => resolve(true));
    });
    if (ok) break;
    if (port > PREFERRED_PORT + 20) throw new Error("No free port for the report page");
  }
  await writeFile(serverFile(root), JSON.stringify({ port, pid: process.pid, root, startedAt: new Date().toISOString() }, null, 2));

  // the state file is replaced on every write (temp + rename): watch the folder, not the file
  let timer = null;
  watch(path.join(root, STATE_DIR), (event, name) => {
    if (name !== path.basename(statePath(root))) return;
    lastActivity = Date.now();
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const c of clients) c.write(`event: state\ndata: ${Date.now()}\n\n`);
    }, 150);
  });

  setInterval(async () => {
    if (!clients.size && Date.now() - lastActivity > IDLE_MS) {
      await rm(serverFile(root), { force: true });
      process.exit(0);
    }
    for (const c of clients) c.write(": keep-alive\n\n");
  }, 30_000).unref?.();

  return `http://127.0.0.1:${port}/`;
}

function json(res, body) {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(body));
}

async function send(res, file) {
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}
