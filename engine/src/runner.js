import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BrowserMissing, launchBrowser } from "./browser.js";
import { CheckBug, makeContext } from "./context.js";
import { createCrawler } from "./crawl.js";
import { detect } from "./detect.js";
import { createHttp, HttpError } from "./http.js";
import { findingId, mapLimit } from "./lib/text.js";
import { startLocal } from "./local.js";
import { loadProject } from "./project.js";
import { writeReport } from "./report.js";
import { summarize } from "./score.js";
import { mergeRun, readState, STATE_DIR, writeState } from "./state.js";
import { mkdir } from "node:fs/promises";

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
  if (!target) throw new UsageError("Missing --target. Give the address to scan (--target https://my-app.com) or --target local");
  if (target === "local") return "local";
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
const CHECK_TIMEOUT_MS = { mechanical: 60_000, browser: 240_000 };

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
async function prepare({ root, target, maxPages = 30 }) {
  let url = parseTarget(target);
  const project = await loadProject(root);
  let local = null;
  if (url === "local") {
    local = await startLocal(project);
    url = local.url;
  }
  try {
    return { ...(await reach({ url, project, maxPages })), local };
  } catch (err) {
    await local?.stop();
    throw err;
  }
}

async function reach({ url, project, maxPages }) {
  const http = createHttp();
  try {
    await http.request(url, { as: "none" });
  } catch (err) {
    throw new Error(`Couldn't reach ${url} (${err.code ?? err.message}). Is the site running?`);
  }
  const crawl = createCrawler({ target: url, http, limit: maxPages });
  const pages = await crawl.pages();
  if (!pages.length) {
    const home = (await crawl.visited()).get(new URL(url).href);
    throw new Error(`${url} answered${home?.status ? ` with status ${home.status}` : ""}, but no page could be read there. Is this the right address?`);
  }
  const detected = await detect(project, pages);
  return { url, http, project, crawl, pages, detected };
}

export async function detectOnly({ root, target }) {
  const { detected, pages, local } = await prepare({ root, target });
  await local?.stop();
  return { detected, pages: pages.map((p) => p.path) };
}

/**
 * Runs one check with a timeout. Network trouble means "couldn't tell", never "fail".
 * @returns {Promise<{ entry: any, status: string, reason?: string, items: any[], error?: string }>}
 */
async function runOne(c, ctx) {
  try {
    let timer;
    const timeout = new Promise((_, rej) => (timer = setTimeout(() => rej(new HttpError(ctx.target, { name: "check timed out" })), CHECK_TIMEOUT_MS[c.entry.layer] ?? 60_000)));
    const items = await Promise.race([c.check.run(ctx), timeout]).finally(() => clearTimeout(timer));
    if (!Array.isArray(items)) throw new CheckBug(`${c.id}: run() must return an array`);
    const skip = items.find((i) => i.status === "skip");
    if (skip) return { entry: c.entry, status: "skip", reason: skip.reason, ...(skip.needs ? { needs: skip.needs } : {}), items: [] };
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

/** Saves a check's screenshot as the finding's before.png — unless it already has one. */
async function saveShots(root, state, results) {
  for (const r of results) {
    for (const item of r.items) {
      if (!Buffer.isBuffer(item.shot)) continue;
      const id = findingId(r.entry.id, item.key);
      const existing = state.findings[id]?.shots?.before;
      if (existing) {
        item.shot = existing;
        continue;
      }
      const rel = `shots/${id}/before.png`;
      await mkdir(path.join(root, STATE_DIR, "shots", id), { recursive: true });
      await writeFile(path.join(root, STATE_DIR, rel), item.shot);
      item.shot = rel;
    }
  }
}

/** A finding fixed this run that had a before.png gets an after.png from the same page and width. */
async function saveAfterShots(root, state, fixedIds, browser, base) {
  if (!browser) return;
  for (const id of fixedIds) {
    const f = state.findings[id];
    if (!f.shots?.before || !f.location?.url) continue;
    try {
      const p = await browser.open(new URL(f.location.url, base).href, { width: f.location.viewport ?? 1280 });
      const rel = `shots/${id}/after.png`;
      await mkdir(path.join(root, STATE_DIR, "shots", id), { recursive: true });
      await writeFile(path.join(root, STATE_DIR, rel), await p.screenshot());
      f.shots.after = rel;
    } catch {
      // no after shot is better than a failed run
    }
  }
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
 * @param {{ root: string, target: string, mode: "full"|"quick", only?: string, consent?: string[], staging?: boolean, maxPages?: number,
 *   catalog: any, checks: { implemented: any[], notImplemented: string[] }, now?: () => Date, onProgress?: (msg: string) => void }} opts
 */
export async function run({ root, target, mode, only, consent = [], staging = false, maxPages = 30, catalog, checks, now = () => new Date(), onProgress = () => {} }) {
  const selected = selectChecks(checks.implemented, only, catalog).filter((c) => MODE_LAYERS[mode].has(c.entry.layer));
  const startedAt = now();
  const { url, http, project, crawl, pages, detected, local } = await prepare({ root, target, maxPages });
  if (local) onProgress(`Started the app locally (${local.how}) at ${url}`);

  let browser = null;
  try {
    const applicable = (c) => c.entry.appliesWhen === "always" || detected[c.entry.appliesWhen]?.value;
    if (selected.some((c) => c.entry.layer === "browser" && applicable(c))) {
      browser = await launchBrowser();
      crawl.attachBrowser(browser);
      onProgress(`Using your installed Chrome (${browser.version})`);
    }

    const state = await readState(root);
    const runId = makeRunId(startedAt, new Set(state.runs.map((r) => r.id)));

    const runLayer = (layer, limit) =>
      mapLimit(selected.filter((c) => c.entry.layer === layer), limit, async (c) => {
        const fact = c.entry.appliesWhen;
        if (fact !== "always" && !detected[fact]?.value) {
          return { entry: c.entry, status: "skip", reason: detected[fact]?.why ?? `not relevant (${fact})`, items: [] };
        }
        const ctx = makeContext({ entry: c.entry, project, crawl, http, browser, target: url, detected, now: startedAt, consent, staging });
        return runOne(c, ctx);
      });
    const results = [...(await runLayer("mechanical", 8)), ...(browser ? await runLayer("browser", 3) : [])];
    // keep catalog order so state and report don't depend on which check finished first
    const order = new Map(catalog.checks.map((c, i) => [c.id, i]));
    results.sort((a, b) => order.get(a.entry.id) - order.get(b.entry.id));

    state.project.detected = detected;
    await saveShots(root, state, results);
    const at = now().toISOString();
    const rendered = browser ? await crawl.browserPages().catch(() => []) : [];
    const changes = mergeRun(state, { runId, at, results, scannedPaths: verifiablePaths([...pages, ...rendered]) });
    await saveAfterShots(root, state, changes.fixed, browser, url);
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
      pages: Math.max(pages.length, rendered.length),
      changes,
    };
    state.runs.push(record);
    await writeState(root, state);
    await writeReport(root, catalog, state);
    const gitignored = await ensureGitignore(root, project);

    return {
      run: record,
      gitignored,
      local: local ? { how: local.how, url } : null,
      ran: results.map((r) => ({ id: r.entry.id, layer: r.entry.layer, status: r.status, ...(r.reason ? { reason: r.reason } : {}), ...(r.needs ? { needs: r.needs } : {}) })),
      errors: results.filter((r) => r.error).map((r) => r.error),
      implemented: checks.implemented.map((c) => c.id),
      notImplemented: checks.notImplemented,
      catalogSize: catalog.checks.length,
    };
  } finally {
    await browser?.close();
    await local?.stop();
  }
}

export { BrowserMissing };
