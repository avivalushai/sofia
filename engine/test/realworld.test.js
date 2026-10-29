// Behaviours found in the false-positive pass over real apps (NehoRace, Blockout), as tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { copyFixture } from "./helpers/serve.js";
import { ANALYTICS_HOSTS } from "../src/lib/browser-checks.js";
import { isChallenge } from "../src/lib/blocked.js";

const BIN = fileURLToPath(new URL("../bin/launch-check.js", import.meta.url));
const exec = promisify(execFile);

async function lc(cwd, ...args) {
  try {
    const { stdout } = await exec(process.execPath, [BIN, ...args, "--json"], { cwd });
    return { code: 0, out: JSON.parse(stdout) };
  } catch (e) {
    return { code: e.code, out: null, err: e.stderr };
  }
}
const state = async (dir) => JSON.parse(await readFile(path.join(dir, ".launch-check", "state.json"), "utf8"));

/** A tiny site: routes map path → { status, headers, body }. */
async function site(routes) {
  const server = createServer((req, res) => {
    const r = routes[new URL(req.url, "http://x").pathname] ?? { status: 404, body: "Not Found", headers: { "content-type": "text/plain" } };
    res.writeHead(r.status ?? 200, { "content-type": "text/html; charset=utf-8", ...r.headers }).end(r.body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

const CHALLENGE = { status: 403, headers: { "x-vercel-mitigated": "challenge", "content-type": "text/html" }, body: "<title>Vercel Security Checkpoint</title>Failed to verify your browser" };
const PAGE = (extra = "") => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Site</title></head><body><main><h1>Hello</h1><p>Some text here.</p>${extra}</main></body></html>`;

test("bot protection on part of the page: the checks say \"couldn't tell\", never \"broken\"", async () => {
  const s = await site({ "/": { body: PAGE('<script src="/app.js"></script><img src="/logo.png" alt="Logo">') }, "/app.js": CHALLENGE, "/logo.png": CHALLENGE });
  const dir = await mkdtemp(path.join(tmpdir(), "lc-blocked-"));
  try {
    const r = await lc(dir, "run", "--target", s.url, "--mode", "full", "--only", "qa.missing-assets,qa.failed-requests,a11y.contrast");
    assert.equal(r.code, 0, r.err);
    const st = await state(dir);
    assert.equal(st.checks["qa.missing-assets"].status, "uncertain");
    assert.equal(st.checks["qa.failed-requests"].status, "uncertain");
    assert.equal(st.checks["a11y.contrast"].status, "pass", "checks that don't depend on the blocked requests still answer");
    assert.ok(Object.values(st.findings).every((f) => f.status !== "open"));
    assert.ok(r.out.run.blocked >= 2);
  } finally {
    await s.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a home page behind a bot challenge stops the scan with a clear message", async () => {
  const s = await site({ "/": CHALLENGE });
  const dir = await mkdtemp(path.join(tmpdir(), "lc-blocked-"));
  try {
    const r = await lc(dir, "run", "--target", s.url, "--mode", "quick");
    assert.equal(r.code, 1);
    assert.match(r.err, /bot protection/);
    assert.match(r.err, /never tries to get past it/);
  } finally {
    await s.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a local copy can't run the app's server functions: those requests are \"couldn't tell\"", async () => {
  const dir = await copyFixture("broken-landing");
  try {
    await mkdir(path.join(dir, "api"));
    await writeFile(path.join(dir, "api", "scores.mjs"), "export default (req, res) => res.json([]);");
    const html = path.join(dir, "pricing.html");
    await writeFile(html, (await readFile(html, "utf8")).replace("</body>", '<script>fetch("/api/scores")</script></body>'));
    const r = await lc(dir, "run", "--target", "local", "--mode", "full", "--only", "qa.failed-requests,a11y.contrast");
    assert.equal(r.code, 0, r.err);
    const st = await state(dir);
    const failed = Object.values(st.findings).filter((f) => f.checkId === "qa.failed-requests");
    assert.ok(failed.some((f) => f.status === "uncertain" && /doesn't run in this local copy/.test(f.title)));
    assert.ok(!failed.some((f) => f.status === "open" && /api\/scores/.test(f.evidence)), "the server function isn't reported as broken");
    assert.equal(st.checks["a11y.contrast"].status, "fail", "everything else on the page is still checked");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a full Tailwind gray scale is a design system, not too many grays", async () => {
  const zinc = ["#fafafa", "#f4f4f5", "#e4e4e7", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#18181b"];
  const body = zinc.map((c, i) => `<p style="color:${c};background:${zinc[(i + 4) % zinc.length]}">Shade ${i}</p>`).join("");
  const s = await site({ "/": { body: PAGE(body) } });
  const dir = await mkdtemp(path.join(tmpdir(), "lc-palette-"));
  try {
    await lc(dir, "run", "--target", s.url, "--mode", "full", "--only", "design.palette");
    assert.equal((await state(dir)).checks["design.palette"].status, "pass");
  } finally {
    await s.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("\"http://localhost\" used as a base for parsing addresses isn't a call to the developer's machine", async () => {
  const dir = await copyFixture("broken-landing");
  try {
    const js = path.join(dir, "assets", "app.js");
    await writeFile(js, (await readFile(js, "utf8")).replace('const API = "http://localhost:3000/api";', 'const API = "/api";\nconst u = new URL(location.pathname, "http://localhost");'));
    await lc(dir, "run", "--target", "local", "--mode", "quick", "--only", "env.localhost-urls");
    assert.equal((await state(dir)).checks["env.localhost-urls"].status, "pass");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Amplitude counts as tracking, and challenges are recognised by header or page", () => {
  for (const u of ["https://api2.amplitude.com/2/httpapi", "https://api.eu.amplitude.com/2/httpapi"]) assert.ok(ANALYTICS_HOSTS.test(u), u);
  assert.ok(isChallenge({ status: 200, headers: { "x-vercel-mitigated": "challenge" } }));
  assert.ok(isChallenge({ status: 403, headers: {}, body: "<title>Just a moment...</title>" }));
  assert.ok(!isChallenge({ status: 403, headers: {}, body: "Forbidden" }), "a plain 403 is the site's own answer");
});

test("Blockout: editor panels and component demos aren't forms people submit", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lc-demos-"));
  try {
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "demos", dependencies: { react: "18.0.0" } }));
    // a component showcase: a demo sign-in form that goes nowhere, with a read-only password
    await writeFile(path.join(dir, "src", "Blocks.jsx"), `export const Demo = () => (
  <form className="demo">
    <Input placeholder="Full name" />
    <Input placeholder="Email" />
    <Input type="password" readOnly />
    <Button>Sign in</Button>
  </form>
);`);
    // an editor's properties panel: fields that change the screen, not send anything
    await writeFile(path.join(dir, "src", "Inspector.jsx"), `export const Inspector = ({ box, set }) => (
  <div>
    <input value={box.title} onChange={(e) => set({ title: e.target.value })} />
    <input value={box.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
  </div>
);`);
    // the word "Resend" in a sentence isn't an email service
    await writeFile(path.join(dir, "src", "templates.js"), `export const verify = { body: "We sent a code to your email. Didn't get it? Resend.", form: "contact" };`);
    const s = await site({ "/": { body: PAGE() } });
    const r = await lc(dir, "run", "--target", s.url, "--mode", "quick", "--only", "forms.spam,forms.enterkey,forms.autocomplete,forms.backup");
    await s.close();
    assert.equal(r.code, 0, r.err);
    const st = await state(dir);
    for (const id of ["forms.spam", "forms.enterkey", "forms.autocomplete", "forms.backup"]) assert.equal(st.checks[id].status, "pass", id);
    // the same demo without the password (so not a login form), now sending somewhere: a real form
    await writeFile(path.join(dir, "src", "Blocks.jsx"), (await readFile(path.join(dir, "src", "Blocks.jsx"), "utf8")).replace('<form className="demo">', '<form className="demo" onSubmit={(e) => fetch("/api/join", { method: "POST", body: new FormData(e.target) })}>').replace('<Input type="password" readOnly />', ""));
    const s2 = await site({ "/": { body: PAGE() } });
    await lc(dir, "run", "--target", s2.url, "--mode", "quick", "--only", "forms.spam,forms.enterkey");
    await s2.close();
    assert.equal((await state(dir)).checks["forms.spam"].status, "fail");
    assert.equal((await state(dir)).checks["forms.enterkey"].status, "fail");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Blockout: buttons overlapping only inside a scrolled panel or under a dialog aren't reported", async () => {
  const panel = `<div style="height:120px;overflow:auto;width:300px"><div style="height:600px"></div><button style="display:block;width:200px">Hidden one</button></div>
<button style="position:relative;top:-40px;width:200px">Visible one</button>`;
  const dialog = `<button id="a" style="width:200px">Under</button><button style="margin-top:-24px;display:block;width:200px">Also under</button>
<div style="position:fixed;inset:0;background:rgba(0,0,0,.5)"></div>`;
  for (const [name, html] of [["panel", panel], ["dialog", dialog]]) {
    const s = await site({ "/": { body: PAGE(html) } });
    const dir = await mkdtemp(path.join(tmpdir(), "lc-overlap-"));
    try {
      const r = await lc(dir, "run", "--target", s.url, "--mode", "full", "--only", "resp.tablet");
      assert.equal(r.code, 0, r.err);
      const st = await state(dir);
      assert.equal(st.checks["resp.tablet"].status, "pass", `${name}: ${Object.values(st.findings).map((f) => f.evidence).join(" | ")}`);
    } finally {
      await s.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
});
