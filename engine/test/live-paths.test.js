// The parts of checks that only run against a live (non-local) address, with the network stubbed out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadCatalog } from "../src/catalog.js";
import { makeContext } from "../src/context.js";
import { loadProject } from "../src/project.js";
import { meta, parseHtml } from "../src/lib/html.js";

const catalog = await loadCatalog();
const TARGET = "https://tidy.example/";

/** routes: { url: { status?, headers?, body? } | (opts) => response } */
async function run(id, routes, { files = {}, pages = [], dns = null, target = TARGET } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "lc-live-"));
  try {
    for (const [f, text] of Object.entries(files)) await writeFile(path.join(dir, f), text);
    const respond = async (url, o = {}) => {
      const r = typeof routes[url] === "function" ? routes[url](o) : routes[url];
      return { status: 404, headers: {}, body: "", url, ...r };
    };
    const http = { get: respond, request: respond, blocked: new Map() };
    const crawl = { pages: async () => pages.map((p) => {
      const doc = parseHtml(p.html);
      return { ...p, doc, meta: (k) => meta(doc, k) };
    }) };
    const check = (await import(`../src/checks/${id.replace(".", "/")}.js`)).default;
    const ctx = makeContext({ entry: catalog.byId.get(id), project: await loadProject(dir), crawl, http, target, detected: {}, now: new Date("2026-10-29T12:00:00Z") });
    if (dns) ctx.dns = dns;
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

test("agent.bot-wall on a live site: AI assistants turned away fail; a machine that's blocked anyway is \"couldn't tell\"", async () => {
  const byAgent = (blockAgents, blockAll = false) => (o) => {
    const ua = o.headers?.["user-agent"] ?? "";
    const agent = /ChatGPT-User|Claude-User|Perplexity-User/.test(ua);
    return blockAll || (agent && blockAgents) ? { status: 403, headers: {} } : { status: 200, headers: {} };
  };
  const walled = await run("agent.bot-wall", { [TARGET]: byAgent(true) });
  assert.equal(walled[0].status, "fail");
  assert.match(walled[0].evidence, /ChatGPT got 403; Claude got 403; Perplexity got 403/);
  assert.equal((await run("agent.bot-wall", { [TARGET]: byAgent(false) }))[0].status, "pass");
  assert.equal((await run("agent.bot-wall", { [TARGET]: byAgent(false, true) }))[0].status, "uncertain");
});

test("launch.canonical-host: both addresses must open and end up at one", async () => {
  const ok = { "https://tidy.example/": { status: 200 }, "https://www.tidy.example/": { status: 200, url: "https://tidy.example/" } };
  assert.equal((await run("launch.canonical-host", ok))[0].status, "pass");
  const two = { "https://tidy.example/": { status: 200 }, "https://www.tidy.example/": { status: 200 } };
  assert.equal((await run("launch.canonical-host", two))[0].status, "fail", "both answer, at different hosts");
  const dead = { "https://tidy.example/": { status: 200 } };
  assert.match((await run("launch.canonical-host", dead))[0].title, /doesn't work/);
});

test("launch.custom-domain: a platform address fails, the business's own domain passes", async () => {
  assert.equal((await run("launch.custom-domain", {}, { target: "https://tidy-notes.vercel.app/" }))[0].status, "fail");
  assert.equal((await run("launch.custom-domain", {}))[0].status, "pass");
});

test("launch.staging-noindex: a preview address must say noindex", async () => {
  const target = "https://tidy-git-dev.vercel.app/";
  const pages = [{ url: target, path: "/", html: "<title>x</title>" }];
  assert.equal((await run("launch.staging-noindex", { [target]: { status: 200, headers: {} } }, { target, pages }))[0].status, "fail");
  assert.equal((await run("launch.staging-noindex", { [target]: { status: 200, headers: { "x-robots-tag": "noindex" } } }, { target, pages }))[0].status, "pass");
  assert.equal((await run("launch.staging-noindex", {}))[0].status, "skip", "the real domain: nothing to check here");
});

test("launch.redirects-old: addresses the Internet Archive saw that now 404 fail", async () => {
  const archive = "https://web.archive.org/cdx/search/cdx?url=tidy.example/*&output=json&fl=original,statuscode,mimetype&filter=statuscode:200&filter=mimetype:text/html&collapse=urlkey&limit=400";
  const rows = JSON.stringify([["original", "statuscode", "mimetype"], ["http://tidy.example/pricing", "200", "text/html"], ["http://tidy.example/old-blog", "200", "text/html"], ["http://tidy.example/style.css", "200", "text/html"]]);
  const routes = { [archive]: { status: 200, body: rows }, "https://tidy.example/pricing": { status: 200 } };
  const r = await run("launch.redirects-old", routes);
  assert.equal(r[0].status, "fail");
  assert.match(r[0].evidence, /\/old-blog/);
  assert.doesNotMatch(r[0].evidence, /style\.css|\/pricing/);
});

test("run.domain-expiry: expiring soon fails, far away passes, a registry without dates is \"couldn't tell\"", async () => {
  const rdap = (date) => ({ "https://rdap.org/domain/tidy.example": { status: 200, body: JSON.stringify({ events: date ? [{ eventAction: "expiration", eventDate: date }] : [] }) } });
  assert.equal((await run("run.domain-expiry", rdap("2026-11-20T00:00:00Z")))[0].status, "fail");
  assert.equal((await run("run.domain-expiry", rdap("2027-09-01T00:00:00Z")))[0].status, "pass");
  assert.equal((await run("run.domain-expiry", rdap(null)))[0].status, "uncertain");
});

test("launch.dns: a missing www record and a dangling platform record fail", async () => {
  const dns = (www) => ({ a: async (n) => (n === "tidy.example" || (www && n === "www.tidy.example") ? ["76.76.21.21"] : []), cname: async () => [], txt: async () => [], mx: async () => [] });
  assert.equal((await run("launch.dns", {}, { dns: dns(true) }))[0].status, "pass");
  assert.match((await run("launch.dns", {}, { dns: dns(false) }))[0].evidence, /www\.tidy\.example has no record/);
  const dangling = { a: async (n) => (n === "tidy.example" ? ["76.76.21.21"] : []), cname: async () => ["old-tidy.herokuapp.com"], txt: async () => [], mx: async () => [] };
  assert.match((await run("launch.dns", { "https://www.tidy.example/": { status: 404 } }, { dns: dangling }))[0].evidence, /dangling/);
});
