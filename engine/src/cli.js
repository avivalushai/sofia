import { parseArgs } from "node:util";
import { CatalogError, loadCatalog, loadChecks } from "./catalog.js";
import { BrowserMissing, detectOnly, run, UsageError } from "./runner.js";
import { statePath } from "./state.js";

const USAGE = `Usage: launch-check <command> [options]

Commands:
  run --target <url|local> [--mode full|quick] [--only <ids|categories>]
      [--consent submit-forms,test-accounts] [--staging] [--max-pages 30]
  detect --target <url|local>           print detected project facts
  recheck | review-tasks | add-findings | decide | serve | export   (not implemented yet)

Options:
  --target local   start the app on this machine (its dev script, or a plain HTML folder) and stop it afterwards
  --consent        side effects the user agreed to; they only ever run against local or staging
  --staging        the target is a staging copy, not the live site
  --json           machine-readable output`;

const LATER = new Set(["recheck", "review-tasks", "add-findings", "decide", "serve", "export"]);
const LAYER_TITLE = { mechanical: "Mechanical checks", browser: "Browser checks", judgment: "Judgment checks" };

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code: 0 ok, 1 failed, 2 bad usage
 */
export async function main(argv, { cwd = process.cwd(), out = console.log, err = console.error } = {}) {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        target: { type: "string" },
        mode: { type: "string", default: "full" },
        only: { type: "string" },
        consent: { type: "string" },
        staging: { type: "boolean", default: false },
        "max-pages": { type: "string", default: "30" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    err(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  const { values: opts, positionals } = args;
  const [command] = positionals;

  if (opts.help || !command) {
    out(USAGE);
    return command || opts.help ? 0 : 2;
  }
  if (LATER.has(command)) {
    err(`"${command}" is not implemented yet.`);
    return 1;
  }
  if (command !== "run" && command !== "detect") {
    err(`Unknown command "${command}".\n\n${USAGE}`);
    return 2;
  }
  if (!["full", "quick"].includes(opts.mode)) {
    err(`--mode must be full or quick, not "${opts.mode}"`);
    return 2;
  }
  const maxPages = Number(opts["max-pages"]);
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    err(`--max-pages must be a whole number, not "${opts["max-pages"]}"`);
    return 2;
  }
  const consent = (opts.consent ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const unknownConsent = consent.filter((c) => !["submit-forms", "test-accounts"].includes(c));
  if (unknownConsent.length) {
    err(`--consent: unknown "${unknownConsent.join(", ")}" (use submit-forms, test-accounts)`);
    return 2;
  }

  try {
    // Validated on every start: a broken catalog or a stray check file stops everything.
    const catalog = await loadCatalog();
    const checks = await loadChecks(catalog);

    if (command === "detect") {
      const result = await detectOnly({ root: cwd, target: opts.target });
      if (opts.json) out(JSON.stringify(result));
      else {
        for (const [fact, { value, why }] of Object.entries(result.detected)) out(`${value ? "✓" : "·"} ${fact.padEnd(6)} ${why}`);
        out(`  ${result.pages.length} pages: ${result.pages.join(" ")}`);
      }
      return 0;
    }

    const result = await run({
      root: cwd, target: opts.target, mode: opts.mode, only: opts.only, consent, staging: opts.staging, maxPages, catalog, checks,
      onProgress: opts.json ? () => {} : (m) => out(`✓ ${m}`),
    });
    for (const e of result.errors) err(`! ${e}`);

    if (opts.json) {
      out(JSON.stringify({ ...result, statePath: statePath(cwd) }));
    } else {
      const byLayer = {};
      for (const r of result.ran) byLayer[r.layer] = (byLayer[r.layer] ?? 0) + 1;
      for (const [layer, n] of Object.entries(byLayer)) out(`✓ ${LAYER_TITLE[layer]} · ${n}`);
      const { run: r } = result;
      out(`✓ ${r.pages} pages scanned · ${result.notImplemented.length} of ${result.catalogSize} checks not built yet`);
      if (result.gitignored) out("✓ Added .launch-check/ to .gitignore");
      const waiting = result.ran.filter((r) => r.needs);
      if (waiting.length) out(`· ${waiting.length} checks need your OK first (${[...new Set(waiting.map((r) => r.needs))].join(", ")})`);
      out(`${r.score ?? "—"} / 100 · ${r.verdict} · blockers ${r.counts.blocker} · important ${r.counts.important} · polish ${r.counts.polish} · passed ${r.counts.passed} · skipped ${r.counts.skipped}`);
      out(`Saved ${statePath(cwd)}`);
    }
    return result.errors.length ? 1 : 0;
  } catch (e) {
    if (e instanceof UsageError) {
      err(e.message);
      return 2;
    }
    err(e instanceof CatalogError || e instanceof BrowserMissing ? e.message : `Launch Check stopped: ${e.message}`);
    return 1;
  }
}
