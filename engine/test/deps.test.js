// The library checks on small temporary projects. deps.vulnerable asks osv.dev (free, public); offline it
// answers "couldn't tell", and the test accepts that rather than failing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadCatalog } from "../src/catalog.js";
import { makeContext } from "../src/context.js";
import { loadProject } from "../src/project.js";

const catalog = await loadCatalog();

async function run(id, files) {
  const dir = await mkdtemp(path.join(tmpdir(), "lc-deps-"));
  try {
    for (const [f, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, f)), { recursive: true });
      await writeFile(path.join(dir, f), typeof text === "string" ? text : JSON.stringify(text));
    }
    const check = (await import(`../src/checks/${id.replace(".", "/")}.js`)).default;
    const ctx = makeContext({ entry: catalog.byId.get(id), project: await loadProject(dir), crawl: { pages: async () => [] }, http: { get: async () => ({ status: 404, headers: {} }), request: async () => ({ status: 404, headers: {} }), blocked: new Map() }, target: "http://127.0.0.1:1/", detected: {}, now: new Date() });
    return await check.run(ctx);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const project = (version) => ({
  "package.json": { name: "x", dependencies: { lodash: `^${version}` } },
  "package-lock.json": { lockfileVersion: 3, packages: { "": { dependencies: { lodash: `^${version}` } }, "node_modules/lodash": { version } } },
});

// the "current" version is a live fact: if a new advisory lands for it, move it to the newest fixed release
test("deps.vulnerable: an old lodash with known serious holes fails, the current one passes", async (t) => {
  const old = await run("deps.vulnerable", project("4.17.11"));
  if (old[0].status === "uncertain") return t.skip("osv.dev unreachable from here");
  assert.equal(old[0].status, "fail");
  assert.match(old[0].evidence, /lodash@4\.17\.11/);
  // 4.17.21 was "the safe version" for years; a HIGH advisory (_.template) was fixed in 4.18.0
  assert.equal((await run("deps.vulnerable", project("4.17.21")))[0].status, "fail");
  assert.equal((await run("deps.vulnerable", project("4.18.1")))[0].status, "pass");
});

test("deps.vulnerable: no lockfile means the versions aren't known", async () => {
  const r = await run("deps.vulnerable", { "package.json": { name: "x", dependencies: { lodash: "^4.17.11" } } });
  assert.equal(r[0].status, "uncertain");
});

test("deps.heavy: moment for one date fails; used across the app, or not used, it passes", async () => {
  const one = { "package.json": { name: "x", dependencies: { moment: "2.30.0", react: "18.0.0" } }, "src/Footer.jsx": 'import moment from "moment";\nexport const Y = () => moment().year();\n' };
  const r = await run("deps.heavy", one);
  assert.equal(r[0].status, "fail");
  assert.match(r[0].fix, /date-fns|dayjs/);
  const many = { ...one };
  for (let i = 0; i < 7; i++) many[`src/P${i}.jsx`] = 'import moment from "moment";\nexport const p = moment;\n';
  assert.equal((await run("deps.heavy", many))[0].status, "pass", "used everywhere: replacing it is a project, not a quick win");
  assert.equal((await run("deps.heavy", { "package.json": { name: "x", dependencies: { moment: "2.30.0" } } }))[0].status, "pass");
});
