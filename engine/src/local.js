import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import path from "node:path";

const SCRIPTS = ["dev", "start", "serve", "preview"];
/** frameworks that accept --port, and the flag they use */
const PORT_FLAG = { next: "--port", vite: "--port", astro: "--port", nuxt: "--port", "@sveltejs/kit": "--port", "@remix-run/dev": "--port", "@angular/cli": "--port", gatsby: "--port", parcel: "--port" };
const URL_IN_OUTPUT = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d+)/;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".txt": "text/plain", ".xml": "application/xml", ".woff2": "font/woff2" };

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function waitFor(url, ms, isDead) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (isDead()) return false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      await res.body?.cancel();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
}

/** Serves a plain HTML folder, for projects with no dev script. */
async function serveStatic(dir) {
  const server = createServer(async (req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    // like real static hosts: never serve hidden files (.git, .env, .launch-check)
    if (rel.split("/").some((part) => part.startsWith(".") && part !== ".well-known")) return res.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(dir, rel);
    if (!file.startsWith(dir + path.sep) && file !== dir) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" }).end(body);
    } catch {
      // like Netlify, GitHub Pages and Vercel: a 404.html at the root is the not-found page
      const custom = await readFile(path.join(dir, "404.html")).catch(() => null);
      if (custom) res.writeHead(404, { "content-type": TYPES[".html"] }).end(custom);
      else res.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/`, stop: () => new Promise((r) => server.close(() => r())) };
}

/**
 * Starts the project locally on a free port: its dev script if it has one, otherwise a static
 * server for a plain HTML folder. We always start our own copy rather than reuse whatever is on
 * the usual port, so we never scan a different app by mistake.
 * @param {Awaited<ReturnType<import("./project.js").loadProject>>} project
 * @returns {Promise<{ url: string, how: string, stop: () => Promise<void> }>}
 */
export async function startLocal(project) {
  const script = SCRIPTS.find((s) => project.pkg?.scripts?.[s]);
  if (!script) {
    const dir = ["", "public", "dist", "build", "out"].find((d) => project.has(d ? `${d}/index.html` : "index.html"));
    if (dir === undefined) throw new Error("Couldn't find how to start the app locally: no dev script in package.json and no index.html. Start it yourself and pass its address with --target.");
    const s = await serveStatic(path.join(project.root, dir));
    return { ...s, how: `served the ${dir || "project"} folder` };
  }

  const port = await freePort();
  const framework = Object.keys(PORT_FLAG).find((f) => project.deps.has(f));
  const args = ["run", script, ...(framework ? ["--", PORT_FLAG[framework], String(port)] : [])];
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd: project.root,
    env: { ...process.env, PORT: String(port), BROWSER: "none", FORCE_COLOR: "0" },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let announced = null;
  let dead = false;
  const onData = (d) => {
    output = (output + d).slice(-4000);
    announced ??= output.match(URL_IN_OUTPUT)?.[1] ?? null;
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", () => (dead = true));

  const stop = async () => {
    if (dead) return;
    try {
      if (process.platform === "win32") child.kill();
      else process.kill(-child.pid, "SIGTERM");
    } catch {}
  };

  const until = Date.now() + 90_000;
  let url = null;
  while (!url && Date.now() < until && !dead) {
    const candidate = `http://localhost:${announced ?? port}/`;
    if (await waitFor(candidate, 2000, () => dead)) url = candidate;
  }
  if (!url) {
    await stop();
    throw new Error(`"npm run ${script}" didn't start the app within 90 seconds.${output ? `\nLast output:\n${output.trim().split("\n").slice(-8).join("\n")}` : ""}`);
  }
  return { url, how: `npm run ${script}`, stop };
}
