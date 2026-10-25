import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CATALOG_PATH = fileURLToPath(new URL("../../catalog/checks.json", import.meta.url));
export const CHECKS_DIR = fileURLToPath(new URL("./checks/", import.meta.url));
/** Judgment checks are "built" when their rubric exists: the reviewer reads code against it (docs/03). */
export const RUBRICS_DIR = fileURLToPath(new URL("../../skills/check/references/rubrics/", import.meta.url));

export const LAYERS = ["mechanical", "browser", "judgment"];
export const SEVERITIES = ["blocker", "important", "polish"];
export const FIXERS = ["claude", "choice", "user"];

const ID_PATTERN = /^[a-z0-9]+\.[a-z0-9-]+$/;
const STRING_FIELDS = ["id", "category", "categoryTitle", "title", "how", "appliesWhen"];

export class CatalogError extends Error {
  /** @param {string} message @param {string[]} problems */
  constructor(message, problems) {
    super(`${message}\n  - ${problems.join("\n  - ")}`);
    this.problems = problems;
  }
}

/**
 * Checks the shape of catalog/checks.json. Returns a list of problems; empty means valid.
 * @param {any} data
 * @returns {string[]}
 */
export function validateCatalog(data) {
  const problems = [];
  if (!data || typeof data !== "object") return ["catalog is not a JSON object"];
  if (data.version !== 1) problems.push(`unsupported catalog version: ${data.version}`);
  if (!data.facts || typeof data.facts !== "object") problems.push("missing facts");
  if (!Array.isArray(data.checks)) return [...problems, "missing checks array"];

  const facts = new Set(Object.keys(data.facts ?? {}));
  const seen = new Set();
  data.checks.forEach((c, i) => {
    const where = `checks[${i}]${c?.id ? ` (${c.id})` : ""}`;
    for (const f of STRING_FIELDS) {
      if (typeof c?.[f] !== "string" || !c[f]) problems.push(`${where}: missing ${f}`);
    }
    if (typeof c?.id !== "string") return;
    if (!ID_PATTERN.test(c.id)) problems.push(`${where}: id must look like "category.name"`);
    else if (c.id.split(".")[0] !== c.category) problems.push(`${where}: id prefix doesn't match category "${c.category}"`);
    if (seen.has(c.id)) problems.push(`${where}: duplicate id`);
    seen.add(c.id);
    if (!LAYERS.includes(c.layer)) problems.push(`${where}: unknown layer "${c.layer}"`);
    if (!SEVERITIES.includes(c.severity)) problems.push(`${where}: unknown severity "${c.severity}"`);
    if (!FIXERS.includes(c.fixer)) problems.push(`${where}: unknown fixer "${c.fixer}"`);
    if (typeof c.v1 !== "boolean") problems.push(`${where}: v1 must be true or false`);
    if (c.appliesWhen !== "always" && !facts.has(c.appliesWhen)) {
      problems.push(`${where}: appliesWhen "${c.appliesWhen}" is not a known fact`);
    }
  });
  if (data.count !== data.checks.length) {
    problems.push(`count is ${data.count} but there are ${data.checks.length} checks`);
  }
  return problems;
}

/**
 * @param {string} [file]
 * @returns {Promise<{ version: number, facts: Record<string,string>, checks: any[], byId: Map<string, any> }>}
 */
export async function loadCatalog(file = CATALOG_PATH) {
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    throw new CatalogError("Couldn't read the check catalog", [`${file}: ${err.message}`]);
  }
  const problems = validateCatalog(data);
  if (problems.length) throw new CatalogError("The check catalog is invalid", problems);
  return { ...data, byId: new Map(data.checks.map((c) => [c.id, c])) };
}

/** `resp.no-horizontal-scroll` → `resp/no-horizontal-scroll.js` */
export function checkPathFor(id) {
  const [category, name] = id.split(".");
  return path.join(category, `${name}.js`);
}

/**
 * Loads every check file and matches it against the catalog.
 * A file whose id isn't in the catalog is an error; a catalog entry without a file is "not implemented".
 * @param {{ checks: any[], byId: Map<string, any> }} catalog
 * @param {string} [dir]
 */
export async function loadChecks(catalog, dir = CHECKS_DIR, rubricsDir = RUBRICS_DIR) {
  const files = (await readdir(dir, { recursive: true }))
    .filter((f) => f.endsWith(".js"))
    .sort();
  const problems = [];
  const implemented = [];

  for (const rel of files) {
    const mod = await import(pathToFileURL(path.join(dir, rel)).href);
    const check = mod.default;
    const id = check?.id;
    if (typeof id !== "string") {
      problems.push(`${rel}: default export has no id`);
      continue;
    }
    const entry = catalog.byId.get(id);
    if (!entry) {
      problems.push(`${rel}: id "${id}" is not in catalog/checks.json`);
      continue;
    }
    if (path.normalize(rel) !== checkPathFor(id)) problems.push(`${rel}: id "${id}" must live in ${checkPathFor(id)}`);
    if (check.layer !== entry.layer) problems.push(`${rel}: layer "${check.layer}" doesn't match catalog "${entry.layer}"`);
    if (entry.layer !== "judgment" && typeof check.run !== "function") problems.push(`${rel}: missing run(ctx)`);
    implemented.push({ id, file: rel, entry, check });
  }
  for (const f of (await readdir(rubricsDir).catch(() => [])).filter((x) => x.endsWith(".md")).sort()) {
    const id = f.slice(0, -3);
    const entry = catalog.byId.get(id);
    if (!entry) problems.push(`rubrics/${f}: "${id}" is not in catalog/checks.json`);
    else if (entry.layer !== "judgment") problems.push(`rubrics/${f}: "${id}" is a ${entry.layer} check, not a judgment check`);
    else implemented.push({ id, file: `rubrics/${f}`, entry, check: null, rubric: path.join(rubricsDir, f) });
  }
  if (problems.length) throw new CatalogError("Some check files don't match the catalog", problems);

  const have = new Set(implemented.map((c) => c.id));
  const notImplemented = catalog.checks.map((c) => c.id).filter((id) => !have.has(id));
  return { implemented, notImplemented };
}
