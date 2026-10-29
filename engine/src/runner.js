import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BrowserMissing, launchBrowser } from "./browser.js";
import { CheckBug, makeContext } from "./context.js";
import { BLOCKED_FIX, BLOCKED_TITLE, isChallenge, UNAVAILABLE, UNAVAILABLE_FIX, UNAVAILABLE_TITLE } from "./lib/blocked.js";
import { createCrawler } from "./crawl.js";
import { detect } from "./detect.js";
import { createHttp, HttpError } from "./http.js";
import { findingId, mapLimit } from "./lib/text.js";
import { startLocal } from "./local.js";
import { loadProject } from "./project.js";
import { writeReport } from "./report.js";
import { summarize } from "./score.js";
import { mergeRun, readState, STATE_DIR, writeState } from "./state.js";
import { lastScan, refreshCurrent } from "./summary.js";
import { fingerprint, PAGES_FILE, reviewSources, writePagesText } from "./judgment.js";
import { commitAll, isGitRepo, revertCommit } from "./git.js";
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
const MODE_LAYERS = { quick: new Set(["mechanical"]), full: new Set(["mechanical", "browser", "judgment"]) };
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
  let home;
  try {
    home = await http.request(url);
  } catch (err) {
    throw new Error(`Couldn't reach ${url} (${err.code ?? err.message}). Is the site running?`);
  }
  if (isChallenge(home)) {
    throw new Error(`The site's bot protection is answering automated visits with a challenge page, so it can't be checked from here right now. Scan the local version instead (--target local), or allow automated visits in the host's firewall settings for a moment. Sofia never tries to get past it.`);
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
    // checks about bot protection itself read the challenge as their answer
    if (ctx.blocked.size && !c.check.expectsBlocks) {
      // what the check saw was the host's challenge page, not the site: no pass, no fail
      const who = [...new Set(ctx.blocked.values())][0] ?? "the host's bot protection";
      const local = who === UNAVAILABLE;
      const paths = [...ctx.blocked.keys()].slice(0, 3).map((u) => new URL(u).pathname).join(", ");
      return {
        entry: c.entry,
        status: "uncertain",
        reason: local ? `needs the app's server functions, which don't run in this local copy` : `${who} blocked ${ctx.blocked.size} request${ctx.blocked.size > 1 ? "s" : ""} this check needed`,
        items: [ctx.uncertain(local
          ? { key: "unavailable", title: UNAVAILABLE_TITLE, evidence: `${paths} only run on the host`, fix: UNAVAILABLE_FIX }
          : { key: "blocked", title: BLOCKED_TITLE, evidence: `${who} answered ${paths} with a challenge page instead of the site`, fix: BLOCKED_FIX })],
      };
    }
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

/**
 * Review tasks for the judgment checks in this run. A check whose rubric and files haven't changed
 * since its last review keeps that result; one with nothing to read is skipped with a reason.
 */
async function prepareReviews({ root, project, state, runId, detected, pages, checks }) {
  const results = [];
  const pending = [];
  if (!checks.length) return { results, pending };
  let pagesWritten = false;
  const keep = state.reviewTasks.filter((t) => !checks.some((c) => c.id === t.checkId));
  const tasks = [];
  for (const c of checks) {
    const fact = c.entry.appliesWhen;
    if (fact !== "always" && !detected[fact]?.value) {
      results.push({ entry: c.entry, status: "skip", reason: detected[fact]?.why ?? `not relevant (${fact})`, items: [] });
      continue;
    }
    const src = await reviewSources(project, c);
    if (src.skip) {
      results.push({ entry: c.entry, status: "skip", reason: src.skip, items: [] });
      continue;
    }
    if (src.pages && !pagesWritten) {
      await writePagesText(root, pages);
      pagesWritten = true;
    }
    const files = [...src.files, ...(src.pages ? [PAGES_FILE] : [])];
    const fp = await fingerprint(root, c.rubric, files);
    const previous = state.reviewTasks.find((t) => t.checkId === c.id);
    if (previous?.status === "done" && previous.fingerprint === fp) {
      tasks.push(previous); // same code, same rubric: the earlier review stands
      continue;
    }
    const task = { id: `t_${c.id}`, checkId: c.id, run: runId, rubric: `rubrics/${c.id}.md`, files, fingerprint: fp, status: "pending" };
    tasks.push(task);
    pending.push({ ...task, rubric: c.rubric, title: c.entry.title });
  }
  state.reviewTasks = [...keep, ...tasks];
  return { results, pending };
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

/**
 * Can this run vouch for a finding's location? Not when its page failed to load this run, and not
 * when the crawl stopped at its page limit before reaching it. Everything else (files, /robots.txt,
 * /.env…) was requested directly by its check, so the check's answer stands.
 */
function verifiablePaths(pages, visited, limitReached) {
  const loaded = new Set(pages.map((p) => p.path));
  const failed = new Set();
  for (const [u, v] of visited) {
    if (v.error || v.status >= 500) failed.add(new URL(u).pathname + new URL(u).search);
  }
  return {
    has(url) {
      if (loaded.has(url)) return true;
      if (failed.has(url)) return false;
      const looksLikePage = !/\.[a-z0-9]+$/i.test(url.split("?")[0]) || /\.(html?|php|aspx?)$/i.test(url.split("?")[0]);
      return !(limitReached && looksLikePage);
    },
  };
}

/**
 * Runs the applicable, implemented checks and records the run in state.json.
 * @param {{ root: string, target: string, mode: "full"|"quick", only?: string, consent?: string[], staging?: boolean, maxPages?: number,
 *   catalog: any, checks: { implemented: any[], notImplemented: string[] }, now?: () => Date, onProgress?: (msg: string) => void }} opts
 */
export async function run({ root, target, mode, only, consent = [], staging = false, maxPages = 30, kind = "scan", catalog, checks, now = () => new Date(), onProgress = () => {} }) {
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
    const scoreBefore = state.current?.score ?? null;

    // checks that request addresses like /.env or /admin can make a host's firewall start blocking
    // this machine: run them last, so a block can't spoil the rest of the scan
    const isProbe = (c) => Boolean(c.check?.probe);
    const runSet = (list, limit) =>
      mapLimit(list, limit, async (c) => {
        const fact = c.entry.appliesWhen;
        if (fact !== "always" && !detected[fact]?.value) {
          return { entry: c.entry, status: "skip", reason: detected[fact]?.why ?? `not relevant (${fact})`, items: [] };
        }
        const ctx = makeContext({ entry: c.entry, project, crawl, http, browser, target: url, detected, now: startedAt, consent, staging });
        return runOne(c, ctx);
      });
    const layer = (l) => selected.filter((c) => c.entry.layer === l && !isProbe(c));
    // judgment checks: prepare review tasks for the reviewer; nothing is judged here
    const reviews = await prepareReviews({ root, project, state, runId, detected, pages: browser ? await crawl.browserPagesWithText() : pages, checks: layer("judgment") });
    const results = [
      ...reviews.results,
      ...(await runSet(layer("mechanical"), 8)),
      ...(browser ? await runSet(layer("browser"), 3) : []),
      ...(await runSet(selected.filter((c) => isProbe(c) && (c.entry.layer !== "browser" || browser)), 1)),
    ];
    // keep catalog order so state and report don't depend on which check finished first
    const order = new Map(catalog.checks.map((c, i) => [c.id, i]));
    results.sort((a, b) => order.get(a.entry.id) - order.get(b.entry.id));

    state.project.detected = detected;
    await saveShots(root, state, results);
    const at = now().toISOString();
    const rendered = browser ? await crawl.browserPages().catch(() => []) : [];
    const changes = mergeRun(state, { runId, at, results, scannedPaths: verifiablePaths([...pages, ...rendered], await crawl.visited(), Math.max(pages.length, rendered.length) >= maxPages) });
    await saveAfterShots(root, state, changes.fixed, browser, url);
    const { score, verdict, counts } = summarize(catalog, state);

    const record = {
      id: runId,
      kind,
      mode,
      target: url,
      // how to reach the same target again for a recheck ("local" means: start it again)
      targetSpec: target === "local" ? "local" : url,
      ...(consent.length ? { consent } : {}),
      ...(staging ? { staging } : {}),
      ...(only ? { only } : {}),
      startedAt: startedAt.toISOString(),
      finishedAt: now().toISOString(),
      scoreBefore,
      score,
      verdict,
      counts: { ...counts, notImplemented: checks.notImplemented.length },
      pages: Math.max(pages.length, rendered.length),
      ...(http.blocked.size || browser?.blocked.size ? { blocked: http.blocked.size + (browser?.blocked.size ?? 0) } : {}),
      ...(reviews.pending.length ? { reviewsPending: reviews.pending.length } : {}),
      changes,
    };
    state.runs.push(record);
    refreshCurrent(catalog, state, record.finishedAt);
    await writeState(root, state);
    await writeReport(root, catalog, state);
    const gitignored = await ensureGitignore(root, project);

    return {
      run: record,
      gitignored,
      local: local ? { how: local.how, url } : null,
      reviewTasks: reviews.pending,
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

/**
 * Re-runs specific checks against the same target as the last scan, after a fix (docs/02).
 * With a commit message, the fix is committed only if the recheck passes — a fix that didn't work
 * never becomes a commit — and the commit is recorded on every finding it fixed, so that one fix
 * can later be undone on its own.
 * @param {{ root: string, refs: string[], commitMessage?: string, consent?: string[], catalog: any, checks: any, onProgress?: (m: string) => void }} o
 */
export async function recheck({ root, refs, commitMessage, consent, catalog, checks, onProgress = () => {} }) {
  const state = await readState(root);
  const scan = lastScan(state);
  if (!scan) throw new UsageError("There's no scan to re-check yet. Run a scan first.");
  const implemented = new Set(checks.implemented.map((c) => c.id));
  // a finding id → its check; a category → its built checks
  const checkIds = [...new Set(refs.flatMap((r) => {
    if (state.findings[r]) return [state.findings[r].checkId];
    if (catalog.byId.has(r)) return [r];
    const inCategory = catalog.checks.filter((c) => c.category === r && implemented.has(c.id)).map((c) => c.id);
    if (inCategory.length) return inCategory;
    throw new UsageError(`"${r}" is not a check, finding or category`);
  }))];
  const missing = checkIds.filter((id) => !implemented.has(id));
  if (missing.length) throw new UsageError(`Can't re-check ${missing.join(", ")}: not built yet`);

  const scoreBefore = state.current?.score ?? scan.score;
  const mode = checkIds.some((id) => catalog.byId.get(id).layer === "browser") ? "full" : "quick";
  const result = await run({
    root, target: scan.targetSpec ?? scan.target, mode, only: checkIds.join(","), consent: [...new Set([...sessionConsent(state), ...(consent ?? [])])], staging: scan.staging ?? false,
    kind: "recheck", catalog, checks, onProgress,
  });

  const after = await readState(root);
  const passed = checkIds.every((id) => after.checks[id]?.status === "pass");
  let commit = null;
  if (commitMessage && passed && (await isGitRepo(root))) {
    commit = await commitAll(root, `Sofia: ${commitMessage}\n\nChecks: ${checkIds.join(", ")}`);
    if (commit) onProgress(`Committed the fix as ${commit}`);
  }
  // a verified fix leaves the approved list
  const fixedNow = new Set(result.run.changes.fixed);
  if (after.pending.fix.some((id) => fixedNow.has(id))) {
    after.pending.fix = after.pending.fix.filter((id) => !fixedNow.has(id));
    after.pending.updatedAt = new Date().toISOString();
    await writeState(root, after);
  }
  if (commit) {
    for (const id of result.run.changes.fixed) {
      const f = after.findings[id];
      f.fixCommits = [...(f.fixCommits ?? []), commit];
      f.history.at(-1).commit = commit;
    }
    await writeState(root, after);
  }
  const skipped = checkIds.filter((id) => after.checks[id]?.status === "skip").map((id) => ({ id, reason: after.checks[id].reason, ...(after.checks[id].needs ? { needs: after.checks[id].needs } : {}) }));
  const findingsOf = (status) => Object.entries(after.findings).filter(([, f]) => checkIds.includes(f.checkId) && f.status === status).map(([id, f]) => ({ id, title: f.title }));
  return {
    checks: checkIds.map((id) => ({ id, status: after.checks[id]?.status })),
    fixed: result.run.changes.fixed.map((id) => ({ id, title: after.findings[id].title })),
    stillOpen: findingsOf("open"),
    reopened: result.run.changes.reopened.map((id) => ({ id, title: after.findings[id].title })),
    scoreBefore,
    scoreAfter: after.current.score,
    verdict: after.current.verdict,
    commit,
    passed,
    skipped,
    shots: result.run.changes.fixed.map((id) => ({ id, ...after.findings[id].shots })),
    errors: result.errors,
  };
}

/** A yes to side effects lasts for the working session (12 hours), not forever: next week's scan asks again. */
const CONSENT_HOURS = 12;
function sessionConsent(state, now = Date.now()) {
  return [...new Set(state.runs.filter((r) => r.consent && now - Date.parse(r.finishedAt) < CONSENT_HOURS * 3600_000).flatMap((r) => r.consent))];
}

/**
 * Undoes the most recent fix for a check (or a finding's check) with git revert, then re-checks
 * it so the state shows the problem is back.
 */
export async function revert({ root, ref, catalog, checks, onProgress = () => {} }) {
  const state = await readState(root);
  const checkId = state.findings[ref]?.checkId ?? ref;
  const commits = Object.values(state.findings).filter((f) => f.checkId === checkId).flatMap((f) => f.fixCommits ?? []);
  const sha = commits.at(-1);
  if (!sha) throw new UsageError(`No recorded fix commit for ${checkId}, so there's nothing to undo on its own.`);
  if (!(await isGitRepo(root))) throw new UsageError("Undoing one fix needs git; the project isn't a git repository.");
  const revertSha = await revertCommit(root, sha);
  onProgress(`Undid ${sha} with ${revertSha}`);
  const result = await recheck({ root, refs: [checkId], catalog, checks, onProgress });
  return { reverted: sha, revertCommit: revertSha, ...result };
}

export { BrowserMissing };
