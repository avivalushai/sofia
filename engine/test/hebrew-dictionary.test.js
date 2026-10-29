// The Hebrew dictionary is downloaded only for apps with Hebrew text, once, and checked against its fingerprint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("an English-only app never downloads the Hebrew dictionary", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lc-dict-"));
  process.env.SOFIA_CACHE_DIR = dir;
  try {
    const { findTypos } = await import(`../src/lib/spell.js?en=${Date.now()}`);
    const downloads = [];
    await findTypos(["Book your first class today", "We reply within a day"], { onDownload: (m) => downloads.push(m) });
    assert.deepEqual(downloads, []);
    assert.deepEqual(await readdir(dir), [], "nothing was saved");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a Hebrew app downloads it once, verified, and keeps it", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "lc-dict-"));
  process.env.SOFIA_CACHE_DIR = dir;
  try {
    const { hebrewDictionary, DictionaryUnavailable } = await import(`../src/lib/hebrew-dictionary.js?he=${Date.now()}`);
    const downloads = [];
    let dict;
    try {
      dict = await hebrewDictionary({ onDownload: (m) => downloads.push(m) });
    } catch (e) {
      if (e instanceof DictionaryUnavailable && /download/.test(e.message)) return t.skip("npm unreachable from here");
      throw e;
    }
    assert.equal(downloads.length, 1);
    assert.ok(dict.aff.length > 1000 && dict.dic.length > 100000);
    assert.deepEqual((await readdir(path.join(dir, "dictionary-he-2.0.0"))).sort(), ["index.aff", "index.dic"]);
  } finally {
    delete process.env.SOFIA_CACHE_DIR;
    await rm(dir, { recursive: true, force: true });
  }
});
