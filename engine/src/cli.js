import { parseArgs } from "node:util";
import { CatalogError, loadCatalog, loadChecks } from "./catalog.js";
import { detectOnly, run, UsageError } from "./runner.js";
import { statePath } from "./state.js";

const USAGE = `Usage: launch-check <command> [options]

Commands:
  run --target <url> [--mode full|quick] [--only <ids|categories>]
  detect --target <url>                 print detected project facts
  recheck | review-tasks | add-findings | decide | serve | export   (not implemented yet)

Options:
  --json   machine-readable output`;

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

    const result = await run({ root: cwd, target: opts.target, mode: opts.mode, only: opts.only, catalog, checks });
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
      out(`${r.score ?? "—"} / 100 · ${r.verdict} · blockers ${r.counts.blocker} · important ${r.counts.important} · polish ${r.counts.polish} · passed ${r.counts.passed} · skipped ${r.counts.skipped}`);
      out(`Saved ${statePath(cwd)}`);
    }
    return result.errors.length ? 1 : 0;
  } catch (e) {
    if (e instanceof UsageError) {
      err(e.message);
      return 2;
    }
    err(e instanceof CatalogError ? e.message : `Launch Check stopped: ${e.message}`);
    return 1;
  }
}
