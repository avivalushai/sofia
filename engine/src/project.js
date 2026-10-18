import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { lineAt } from "./lib/text.js";

const exec = promisify(execFile);

const ALWAYS_IGNORED = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".output", ".svelte-kit", ".vercel", ".netlify", ".turbo",
  "dist", "build", "out", "coverage", ".launch-check", ".cache", ".parcel-cache", ".expo", "vendor", "__pycache__",
]);
const TEXT_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro", ".html", ".htm", ".css", ".scss",
  ".json", ".md", ".mdx", ".txt", ".yml", ".yaml", ".toml", ".sql", ".rules", ".env", ".prisma", ".php", ".py",
]);
const SOURCE_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro", ".html", ".htm"]);
const NOT_SHIPPED = [
  /(^|\/)(test|tests|__tests__|__mocks__|e2e|cypress|playwright|spec|fixtures|scripts|docs|stories)\//,
  /\.(test|spec|stories)\.[a-z]+$/,
  /(^|\/)[^/]*\.config\.[a-z]+$/,
  /(^|\/)\.[^/]+rc(\.[a-z]+)?$/,
];
const MAX_FILE = 2 * 1024 * 1024;

/**
 * Everything the checks need to know about the project folder.
 * Files respect .gitignore when the project is a git repo.
 * @param {string} root
 */
export async function loadProject(root) {
  const isGit = await gitRoot(root);
  const files = (isGit ? await gitFiles(root) : await walk(root, "")).filter((f) => !f.split("/").some((part) => ALWAYS_IGNORED.has(part))).sort();
  const cache = new Map();
  let pkg = null;
  try {
    pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  } catch {}

  const project = {
    root,
    isGit: Boolean(isGit),
    files,
    pkg,
    deps: new Set(Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies })),
    /** @returns {Promise<string|null>} file text, or null for binary/large/missing files */
    async read(rel) {
      if (!cache.has(rel)) cache.set(rel, readText(path.join(root, rel)));
      return cache.get(rel);
    },
    has(rel) {
      return files.includes(rel);
    },
    /** Source files that end up in the shipped app: no tests, configs, scripts or docs. */
    shippedSource() {
      return files.filter((f) => SOURCE_EXT.has(path.extname(f)) && !NOT_SHIPPED.some((re) => re.test(f)));
    },
    /** @param {RegExp|((f: string) => boolean)} pattern */
    glob(pattern) {
      return files.filter((f) => (typeof pattern === "function" ? pattern(f) : pattern.test(f)));
    },
    /**
     * Searches shipped source (then all text files) for a literal; best-effort map from what a
     * visitor sees to the file to edit.
     * @returns {Promise<{ file: string, line: number }|null>}
     */
    async findText(needle) {
      if (!needle || needle.length < 3) return null;
      const shipped = this.shippedSource();
      const rest = files.filter((f) => TEXT_EXT.has(path.extname(f)) && !shipped.includes(f));
      for (const f of [...shipped, ...rest]) {
        const text = await this.read(f);
        const i = text?.indexOf(needle) ?? -1;
        if (i >= 0) return { file: f, line: lineAt(text, i) };
      }
      return null;
    },
  };
  return project;
}

async function readText(file) {
  try {
    const s = await stat(file);
    if (!s.isFile() || s.size > MAX_FILE) return null;
    const buf = await readFile(file);
    if (buf.subarray(0, 8000).includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

async function gitRoot(root) {
  try {
    const { stdout } = await exec("git", ["-C", root, "rev-parse", "--show-toplevel"]);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function gitFiles(root) {
  const { stdout } = await exec("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.split("\0").filter(Boolean);
}

async function walk(root, rel, out = [], depth = 0) {
  if (depth > 12 || out.length > 20000) return out;
  let entries;
  try {
    entries = await readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (ALWAYS_IGNORED.has(e.name)) continue;
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(root, p, out, depth + 1);
    else if (e.isFile()) out.push(p);
  }
  return out;
}
