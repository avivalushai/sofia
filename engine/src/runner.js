import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CheckBug, makeContext } from "./context.js";
import { createCrawler } from "./crawl.js";
import { detect } from "./detect.js";
import { createHttp, HttpError } from "./http.js";
import { mapLimit } from "./lib/text.js";
import { loadProject } from "./project.js";
import { writeReport } from "./report.js";
import { summarize } from "./score.js";
import { mergeRun, readState, writeState } from "./state.js";

export class UsageError extends Error {}

/** `r_2026-10-18T12-00-00`, with `-2`, `-3`… if a run in the same second already exists. */
export function makeRunId(date, existingIds) {
  const base = `r_${date.toISOString().slice(0, 19).replaceAll(":", "-")}`;
  let id = base;
  for (let n = 2; existingIds.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Resolves --target. Only http(s) URLs for now; "local" (start the dev server) comes later.
 * @param {string} target
 */
export function parseTarget(target) {
  if (!target) throw new UsageError("Missing --target. Give the address to scan, for example --target https://my-app.com");
  if (target === "local") throw new UsageError('Scanning the local version ("--target local") is not supported yet. Start the app and pass its address instead.');
  let url;
  try {
    url = new URL(target);
  } catch {
    throw new UsageError(`"${target}" is not a web address. Use something like https://my-app.com`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UsageError(`"${target}" must start with http:// or https://`);
  }
  return url.href;
}

/** Which layers each mode runs. Judgment checks are never run by the engine (docs/02). */
const MODE_LAYERS = { quick: new Set(["mechanical"]), full: new Set(["mechanical", "browser"]) };
const CHECK_TIMEOUT_MS = 60_000;

/** --only "seo,sec.client-secrets" → the selected check ids. */
export function selectChecks(implemented, only, catalog) {
  if (!only) return implemented;
  const wanted = only.split(",").map((s) => s.trim()).filter(Boolean);
  const categories = new Set(catalog.checks.map((c) => c.category));
  for (const w of wanted) {
    if (!catalog.byId.has(w) && !categories.has(w)) throw new UsageError(`--only: "${w}" is neither a check id nor a category`);
  }
  return implemented.filter((c) => wanted.includes(c.id) || wanted.includes(c.entry.category));
}

/** Prepare everything a run or `detect` needs. */
async function prepare({ root, target }) {
  const url = parseTarget(target);
  const http = createHttp();
  try {
    await http.request(url, { as: "none" });
  } catch (err) {
    throw new Error(`Couldn't reach ${url} (${err.code ?? err.message}). Is the site running?`);
  }
  const project = await loadProject(root);
  const crawl = createCrawler({ target: url, http });
  const pages = await crawl.pages();
  if (!pages.length) {
    const home = (await crawl.visited()).get(new URL(url).href);
    throw new Error(`${url} answered${home?.status ? ` with status ${home.status}` : ""}, but no page could be read there. Is this the right address?`);
  }
  const detected = await detect(project, pages);
  return { url, http, project, crawl, pages, detected };
}

export async function detectOnly({ root, target }) {
  const { detected, pages } = await prepare({ root, target });
  return { detected, pages: pages.map((p) => p.path) };
}

/**
 * Runs one check with a timeout. Network trouble means "couldn't tell", never "fail".
 * @returns {Promise<{ entry: any, status: string, reason?: string, items: any[], error?: string }>}
 */
async function runOne(c, ctx) {
  try {
    let timer;
    const timeout = new Promise((_, rej) => (timer = setTimeout(() => rej(new HttpError(ctx.target, { name: "check timed out" })), CHECK_TIMEOUT_MS)));
    const items = await Promise.race([c.check.run(ctx), timeout]).finally(() => clearTimeout(timer));
    if (!Array.isArray(items)) throw new CheckBug(`${c.id}: run() must return an array`);
    const skip = items.find((i) => i.status === "skip");
    if (skip) return { entry: c.entry, status: "skip", reason: skip.reason, items: [] };
    const status = items.some((i) => i.status === "fail") ? "fail" : items.some((i) => i.status === "uncertain") ? "uncertain" : "pass";
    return { entry: c.entry, status, items };
  } catch (err) {
    const network = err instanceof HttpError || ["ETIMEOUT", "ECONNREFUSED", "ESERVFAIL", "ECONNRESET"].includes(err.code);
    return {
      entry: c.entry,
      status: "uncertain",
      reason: network ? err.message : "the check itself failed",
      items: [],
      ...(network ? {} : { error: `${c.id}: ${err.stack ?? err.message}` }),
    };
  }
}

/** Adds .launch-check/ to the project's .gitignore when the project uses git (docs/06). */
async function ensureGitignore(root, project) {
  const file = path.join(root, ".gitignore");
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch {
    if (!project.isGit) return false;
  }
  if (/^\/?\.launch-check\/?\s*$/m.test(text)) return false;
  await writeFile(file, `${text}${text && !text.endsWith("\n") ? "\n" : ""}.launch-check/\n`);
  return true;
}

/** A page path is only "verified" if the page loaded this run; other resources (files) always are. */
function verifiablePaths(pages) {
  const ok = new Set(pages.map((p) => p.path));
  return {
    has(url) {
      const isResource = /\.[a-z0-9]+$/i.test(url.split("?")[0]) && !/\.(html?|php|aspx?)$/i.test(url.split("?")[0]);
      return isResource || ok.has(url);
    },
  };
}

/**
 * Runs the applicable, implemented checks and records the run in state.json.
 * @param {{ root: string, target: string, mode: "full"|"quick", only?: string, catalog: any, checks: { implemented: any[], notImplemented: string[] }, now?: () => Date }} opts
 */
export async function run({ root, target, mode, only, catalog, checks, now = () => new Date() }) {
  const selected = selectChecks(checks.implemented, only, catalog).filter((c) => MODE_LAYERS[mode].has(c.entry.layer));
  const startedAt = now();
  const { url, http, project, crawl, pages, detected } = await prepare({ root, target });

  const state = await readState(root);
  const runId = makeRunId(startedAt, new Set(state.runs.map((r) => r.id)));

  const results = await mapLimit(selected, 8, async (c) => {
    const fact = c.entry.appliesWhen;
    if (fact !== "always" && !detected[fact]?.value) {
      return { entry: c.entry, status: "skip", reason: detected[fact]?.why ?? `not relevant (${fact})`, items: [] };
    }
    const ctx = makeContext({ entry: c.entry, project, crawl, http, target: url, detected, now: startedAt });
    return runOne(c, ctx);
  });

  state.project.detected = detected;
  const at = now().toISOString();
  const changes = mergeRun(state, { runId, at, results, scannedPaths: verifiablePaths(pages) });
  const { score, verdict, counts } = summarize(catalog, state);

  const record = {
    id: runId,
    mode,
    target: url,
    ...(only ? { only } : {}),
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    score,
    verdict,
    counts: { ...counts, notImplemented: checks.notImplemented.length },
    pages: pages.length,
    changes,
  };
  state.runs.push(record);
  await writeState(root, state);
  await writeReport(root, catalog, state);
  const gitignored = await ensureGitignore(root, project);

  return {
    run: record,
    gitignored,
    ran: results.map((r) => ({ id: r.entry.id, layer: r.entry.layer, status: r.status, ...(r.reason ? { reason: r.reason } : {}) })),
    errors: results.filter((r) => r.error).map((r) => r.error),
    implemented: checks.implemented.map((c) => c.id),
    notImplemented: checks.notImplemented,
    catalogSize: catalog.checks.length,
  };
}
