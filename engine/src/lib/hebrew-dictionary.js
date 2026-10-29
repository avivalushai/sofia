import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

/**
 * The Hebrew dictionary (Hspell, AGPL-3.0) isn't shipped with Sofia. It's downloaded once, only when
 * an app with Hebrew text is scanned, from npm, checked against a fixed fingerprint, and kept on this
 * computer. An English-only app never downloads it.
 */
const VERSION = "2.0.0";
const TARBALL = `https://registry.npmjs.org/dictionary-he/-/dictionary-he-${VERSION}.tgz`;
const INTEGRITY = "sha512-lHtYauHajRL+gnS1iI50RANqn+ce1NnQwbxim2WD6PtX4NXME0vFiqkW/BFAae0kaT1+/86Ze15GAnwsTBBNGA==";

export class DictionaryUnavailable extends Error {}

/** Where it's kept: SOFIA_CACHE_DIR, else the platform's cache folder. */
export function cacheDir() {
  const base = process.env.SOFIA_CACHE_DIR ?? (process.env.XDG_CACHE_HOME ? path.join(process.env.XDG_CACHE_HOME, "sofia") : process.platform === "darwin" ? path.join(homedir(), "Library", "Caches", "sofia") : path.join(homedir(), ".cache", "sofia"));
  return path.join(base, `dictionary-he-${VERSION}`);
}

/** The two files from a .tgz, read straight from the tar format (512-byte headers). */
function extract(tgz, wanted) {
  const tar = gunzipSync(tgz);
  const out = {};
  for (let off = 0; off + 512 <= tar.length; ) {
    const name = tar.toString("utf8", off, off + 100).replace(/\0.*$/s, "");
    if (!name) break;
    const size = parseInt(tar.toString("ascii", off + 124, off + 136).replace(/\0.*$/s, "").trim() || "0", 8);
    const base = path.posix.basename(name);
    if (wanted.includes(base)) out[base] = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

let pending = null;

/**
 * @param {{ onDownload?: (msg: string) => void }} [o]
 * @returns {Promise<{ aff: Buffer, dic: Buffer }>}
 */
export function hebrewDictionary({ onDownload } = {}) {
  pending ??= (async () => {
    const dir = cacheDir();
    try {
      return { aff: await readFile(path.join(dir, "index.aff")), dic: await readFile(path.join(dir, "index.dic")) };
    } catch {}
    onDownload?.("Downloading the Hebrew dictionary (once, about 1 MB)");
    let tgz;
    try {
      const res = await fetch(TARBALL, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`npm answered ${res.status}`);
      tgz = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      throw new DictionaryUnavailable(`couldn't download the Hebrew dictionary (${e.message})`);
    }
    const [algo, expected] = INTEGRITY.split("-");
    if (createHash(algo).update(tgz).digest("base64") !== expected) throw new DictionaryUnavailable("the downloaded Hebrew dictionary didn't match its fingerprint");
    const files = extract(tgz, ["index.aff", "index.dic"]);
    if (!files["index.aff"] || !files["index.dic"]) throw new DictionaryUnavailable("the downloaded Hebrew dictionary was incomplete");
    await mkdir(dir, { recursive: true });
    // write next to the final name, then rename: a half-written file is never read as the dictionary
    for (const [name, buf] of Object.entries(files)) {
      await writeFile(path.join(dir, `${name}.tmp`), buf);
      await rename(path.join(dir, `${name}.tmp`), path.join(dir, name));
    }
    return { aff: files["index.aff"], dic: files["index.dic"] };
  })();
  pending.catch(() => (pending = null));
  return pending;
}
