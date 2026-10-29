// The parts of checks that only run against a live (non-local) address, with the network stubbed out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadCatalog } from "../src/catalog.js";
import { makeContext } from "../src/context.js";
import { loadProject } from "../src/project.js";
import { parseHtml } from "../src/lib/html.js";

const catalog = await loadCatalog();
const TARGET = "https://tidy.example/";

/** routes: { url: { status?, headers?, body? } | (opts) => response } */
async function run(id, routes, { files = {}, pages = [] } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "lc-live-"));
  try {
    for (const [f, text] of Object.entries(files)) await writeFile(path.join(dir, f), text);
    const respond = async (url, o = {}) => {
      const r = typeof routes[url] === "function" ? routes[url](o) : routes[url];
      return { status: 404, headers: {}, body: "", url, ...r };
    };
    const http = { get: respond, request: respond, blocked: new Map() };
    const crawl = { pages: async () => pages.map((p) => ({ ...p, doc: parseHtml(p.html) })) };
    const check = (await import(`../src/checks/${id.replace(".", "/")}.js`)).default;
    const ctx = makeContext({ entry: catalog.byId.get(id), project: await loadProject(dir), crawl, http, target: TARGET, detected: {}, now: new Date() });
    return await check.run(ctx);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("sec.headers on a live site reads the real response headers", async () => {
  const bare = await run("sec.headers", { [TARGET]: { status: 200, headers: {} } });
  assert.equal(bare[0].status, "fail");
  assert.match(bare[0].evidence, /X-Frame-Options.*nosniff.*Strict-Transport-Security/);
  const good = await run("sec.headers", { [TARGET]: { status: 200, headers: { "content-security-policy": "frame-ancestors 'none'", "x-content-type-options": "nosniff", "strict-transport-security": "max-age=63072000" } } });
  assert.equal(good[0].status, "pass");
});

test("sec.cors on a live site: an origin copied back with credentials fails, a fixed origin passes", async () => {
  const reflect = (o) => ({ status: 200, headers: { "access-control-allow-origin": o.headers?.origin ?? "", "access-control-allow-credentials": "true" } });
  assert.equal((await run("sec.cors", { [TARGET]: reflect }))[0].status, "fail");
  assert.equal((await run("sec.cors", { [TARGET]: { status: 200, headers: { "access-control-allow-origin": "https://tidy.example", "access-control-allow-credentials": "true" } } }))[0].status, "pass");
});

test("sec.source-maps on a live site: a map the page points to that downloads fails", async () => {
  const pages = [{ url: TARGET, path: "/", html: '<script src="/assets/app.js"></script>' }];
  const routes = {
    "https://tidy.example/assets/app.js": { status: 200, body: "console.log(1)\n//# sourceMappingURL=app.js.map" },
    "https://tidy.example/assets/app.js.map": { status: 200, body: '{"version":3,"sources":["src/App.tsx"]}' },
  };
  const r = await run("sec.source-maps", routes, { pages });
  assert.equal(r[0].status, "fail");
  assert.equal(r[0].location.url, "/assets/app.js.map");
  delete routes["https://tidy.example/assets/app.js.map"];
  assert.equal((await run("sec.source-maps", routes, { pages }))[0].status, "pass", "a map that 404s is fine");
});
