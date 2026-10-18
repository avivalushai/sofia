import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CatalogError, checkPathFor, loadCatalog, loadChecks, validateCatalog } from "../src/catalog.js";
import { makeRunId } from "../src/runner.js";

const catalog = await loadCatalog();

test("the real catalog is valid: 175 checks, 63 in v1", () => {
  assert.equal(catalog.checks.length, 175);
  assert.equal(catalog.checks.filter((c) => c.v1).length, 63);
});

test("validateCatalog reports bad entries", () => {
  const base = structuredClone(catalog);
  delete base.byId;
  base.checks[0].layer = "magic";
  base.checks[1].id = base.checks[2].id;
  base.checks[3].appliesWhen = "spaceships";
  const problems = validateCatalog(base).join("\n");
  assert.match(problems, /unknown layer "magic"/);
  assert.match(problems, /duplicate id/);
  assert.match(problems, /appliesWhen "spaceships"/);
});

test("checkPathFor mirrors the id", () => {
  assert.equal(checkPathFor("resp.no-horizontal-scroll"), path.join("resp", "no-horizontal-scroll.js"));
});

/** Makes a temporary checks folder with the given files. */
async function checksDir(files) {
  const dir = await mkdtemp(path.join(tmpdir(), "lc-checks-"));
  await writeFile(path.join(dir, "package.json"), '{"type":"module"}');
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), body);
  }
  return dir;
}

test("the shipped checks folder loads: everything is not implemented", async () => {
  const { implemented, notImplemented } = await loadChecks(catalog);
  assert.equal(implemented.length, 0);
  assert.equal(notImplemented.length, 175);
});

test("a check file is matched to its catalog entry", async () => {
  const dir = await checksDir({
    "seo/robots.js": 'export default { id: "seo.robots", layer: "mechanical", async run() { return []; } };',
  });
  try {
    const { implemented, notImplemented } = await loadChecks(catalog, dir);
    assert.deepEqual(implemented.map((c) => c.id), ["seo.robots"]);
    assert.equal(notImplemented.length, 174);
    assert.ok(!notImplemented.includes("seo.robots"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a check id missing from the catalog stops startup", async () => {
  const dir = await checksDir({
    "seo/made-up.js": 'export default { id: "seo.made-up", layer: "mechanical", async run() { return []; } };',
  });
  try {
    await assert.rejects(loadChecks(catalog, dir), (e) => e instanceof CatalogError && /not in catalog/.test(e.message));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a check in the wrong place or with the wrong layer stops startup", async () => {
  const dir = await checksDir({
    "qa/robots.js": 'export default { id: "seo.robots", layer: "browser", async run() { return []; } };',
  });
  try {
    await assert.rejects(loadChecks(catalog, dir), (e) => /must live in/.test(e.message) && /doesn't match catalog/.test(e.message));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("run ids get a suffix when two runs share a second", () => {
  const d = new Date("2026-10-18T12:00:00.500Z");
  assert.equal(makeRunId(d, new Set()), "r_2026-10-18T12-00-00");
  assert.equal(makeRunId(d, new Set(["r_2026-10-18T12-00-00"])), "r_2026-10-18T12-00-00-2");
  assert.equal(makeRunId(d, new Set(["r_2026-10-18T12-00-00", "r_2026-10-18T12-00-00-2"])), "r_2026-10-18T12-00-00-3");
});
