import { parseArgs } from "node:util";
import { CatalogError, loadCatalog, loadChecks } from "./catalog.js";
import { run, UsageError } from "./runner.js";
import { statePath } from "./state.js";

const USAGE = `Usage: launch-check <command> [options]

Commands:
  run --target <url> [--mode full|quick] [--only <ids|category>]
  detect | recheck | review-tasks | add-findings | decide | serve | export   (not implemented yet)

Options:
  --json   machine-readable output`;

const LATER = new Set(["detect", "recheck", "review-tasks", "add-findings", "decide", "serve", "export"]);

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
  if (command !== "run") {
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
    const result = await run({ root: cwd, target: opts.target, mode: opts.mode, catalog, checks });

    if (opts.json) {
      out(JSON.stringify({ ...result, statePath: statePath(cwd) }));
    } else {
      out(`✓ Catalog · ${result.catalogSize} checks · ${result.implemented.length} implemented · ${result.notImplemented.length} not implemented`);
      out(`✓ Run ${result.run.id} · ${result.run.verdict}`);
      out(`✓ Saved ${statePath(cwd)}`);
    }
    return 0;
  } catch (e) {
    if (e instanceof UsageError) {
      err(e.message);
      return 2;
    }
    err(e instanceof CatalogError ? e.message : `Launch Check stopped: ${e.message}`);
    return 1;
  }
}
