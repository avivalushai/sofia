import { createServer } from "node:http";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * Serves a folder on a free port on 127.0.0.1.
 * Missing files get a plain default 404 — expected.json's qa.custom-404 row relies on that.
 * @param {string} nameOrDir folder under fixtures/, or an absolute path
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serveFixture(nameOrDir) {
  const root = path.isAbsolute(nameOrDir) ? nameOrDir : path.join(FIXTURES, nameOrDir);
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://x");
    let rel = decodeURIComponent(pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * Copies a fixture into a fresh temp folder that plays the user's project, without the test metadata
 * (expected.json would otherwise be scanned as part of the "project").
 * @returns {Promise<string>} the folder
 */
export async function copyFixture(name) {
  const dir = await mkdtemp(path.join(tmpdir(), `lc-${name}-`));
  await cp(path.join(FIXTURES, name), dir, { recursive: true, filter: (src) => path.basename(src) !== "expected.json" });
  return dir;
}
