import { readState, writeState } from "./state.js";

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

export class UsageError extends Error {}

/** One request with a timeout, so a wrong address fails clearly instead of producing an empty report. */
async function assertReachable(url, timeoutMs = 10_000) {
  try {
    await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new Error(`Couldn't reach ${url} (${err.cause?.code ?? err.name}). Is the site running?`);
  }
}

/**
 * Runs the applicable, implemented checks and records the run in state.json.
 * M0: no checks exist yet, so this records an empty run.
 * @param {{ root: string, target: string, mode: "full"|"quick", catalog: any, checks: { implemented: any[], notImplemented: string[] }, now?: () => Date }} opts
 */
export async function run({ root, target, mode, catalog, checks, now = () => new Date() }) {
  const url = parseTarget(target);
  await assertReachable(url);

  const state = await readState(root);
  const startedAt = now();
  const id = makeRunId(startedAt, new Set(state.runs.map((r) => r.id)));

  // Running checks, scoring (score.js) and finding merge arrive in M1.
  const counts = { blocker: 0, important: 0, polish: 0, passed: 0, skipped: 0, notImplemented: checks.notImplemented.length };

  const record = {
    id,
    mode,
    target: url,
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    score: null,
    verdict: "No checks yet",
    counts,
  };
  state.runs.push(record);
  await writeState(root, state);
  return { run: record, implemented: checks.implemented.map((c) => c.id), notImplemented: checks.notImplemented, catalogSize: catalog.checks.length };
}
