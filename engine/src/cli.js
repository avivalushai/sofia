import { parseArgs } from "node:util";
import { ActionError, decide, markFixing, queue } from "./actions.js";
import { CatalogError, loadCatalog, loadChecks } from "./catalog.js";
import { detect, liveUrlCandidates } from "./detect.js";
import { checkpoint, dirtyFiles } from "./git.js";
import { loadProject } from "./project.js";
import { writeReport } from "./report.js";
import { BrowserMissing, detectOnly, recheck, revert, run, UsageError } from "./runner.js";
import { readState, statePath, writeState } from "./state.js";
import { buildSummary, refreshCurrent, showItem } from "./summary.js";

const USAGE = `Usage: launch-check <command> [options]

Commands:
  detect [--target <url|local>]           what the app does, how to start it, where it's published
  run --target <url|local> [--mode full|quick] [--only <ids|categories>]
      [--consent submit-forms,test-accounts] [--staging] [--max-pages 30]
  summary                                 score, blockers, the three fixer groups, since last run
  show <checkId|findingId>                every detail of one item
  queue add|remove|clear|list [checkId|findingId...]
                                          the fixes the user approved; nothing else can be fixed
  fixing <checkId|findingId...>           mark approved items as being fixed now
  checkpoint                              a safe point before the first fix of a session
  recheck <checkId|findingId|category...> [--commit "what was fixed"] [--consent ...]
                                          re-run just those checks; with --commit, commit the fix if they pass
  revert <checkId|findingId>              undo that check's last fix on its own, then re-check
  decide <findingId|checkId|category> --action mute|accept|defer|unmute
         --scope instance|check|category --reason "..."
  review-tasks | add-findings | serve | export   (not implemented yet)

Options:
  --target local   start the app on this machine (its dev script, or a plain HTML folder) and stop it afterwards
  --consent        side effects the user agreed to; they only ever run against local or staging
  --staging        the target is a staging copy, not the live site
  --json           machine-readable output`;

const LATER = new Set(["review-tasks", "add-findings", "serve", "export"]);
const COMMANDS = new Set(["detect", "run", "summary", "show", "queue", "fixing", "checkpoint", "recheck", "revert", "decide"]);
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
        commit: { type: "string" },
        action: { type: "string" },
        scope: { type: "string" },
        reason: { type: "string", default: "" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    err(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  const { values: opts, positionals } = args;
  const [command, ...rest] = positionals;
  const print = (obj, text) => out(opts.json ? JSON.stringify(obj) : text);
  const progress = opts.json ? () => {} : (m) => out(`✓ ${m}`);

  if (opts.help || !command) {
    out(USAGE);
    return command || opts.help ? 0 : 2;
  }
  if (LATER.has(command)) {
    err(`"${command}" is not implemented yet.`);
    return 1;
  }
  if (!COMMANDS.has(command)) {
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

    switch (command) {
      case "detect": {
        if (opts.target) {
          const result = await detectOnly({ root: cwd, target: opts.target });
          print(result, factsText(result.detected) + `\n  ${result.pages.length} pages: ${result.pages.join(" ")}`);
          return 0;
        }
        const project = await loadProject(cwd);
        const detected = await detect(project);
        const skips = {};
        for (const [fact, d] of Object.entries(detected)) if (!d.value) skips[fact] = catalog.checks.filter((c) => c.appliesWhen === fact).length;
        const devScript = ["dev", "start", "serve", "preview"].find((s) => project.pkg?.scripts?.[s]);
        const plainHtml = ["", "public", "dist", "build", "out"].some((d) => project.has(d ? `${d}/index.html` : "index.html"));
        const result = {
          detected,
          skippedChecks: skips,
          liveUrls: await liveUrlCandidates(project),
          local: devScript ? { how: `npm run ${devScript}` } : plainHtml ? { how: "serve the HTML folder" } : null,
          git: project.isGit,
        };
        print(result, factsText(detected) + `\n  live: ${result.liveUrls.map((u) => u.url).join(", ") || "unknown"} · local: ${result.local?.how ?? "no way found"}`);
        return 0;
      }

      case "run": {
        const result = await run({ root: cwd, target: opts.target, mode: opts.mode, only: opts.only, consent, staging: opts.staging, maxPages, catalog, checks, onProgress: progress });
        for (const e of result.errors) err(`! ${e}`);
        if (opts.json) out(JSON.stringify({ ...result, statePath: statePath(cwd) }));
        else {
          const byLayer = {};
          for (const r of result.ran) byLayer[r.layer] = (byLayer[r.layer] ?? 0) + 1;
          for (const [layer, n] of Object.entries(byLayer)) out(`✓ ${LAYER_TITLE[layer]} · ${n}`);
          const { run: r } = result;
          out(`✓ ${r.pages} pages scanned · ${result.notImplemented.length} of ${result.catalogSize} checks not built yet`);
          if (result.gitignored) out("✓ Added .launch-check/ to .gitignore");
          const waiting = result.ran.filter((x) => x.needs);
          if (waiting.length) out(`· ${waiting.length} checks need your OK first (${[...new Set(waiting.map((x) => x.needs))].join(", ")})`);
          out(`${r.score ?? "—"} / 100 · ${r.verdict} · blockers ${r.counts.blocker} · important ${r.counts.important} · polish ${r.counts.polish} · passed ${r.counts.passed} · skipped ${r.counts.skipped}`);
          out(`Saved ${statePath(cwd)}`);
        }
        return result.errors.length ? 1 : 0;
      }

      case "summary": {
        const state = await readState(cwd);
        if (!state.runs.length) throw new UsageError("No scan yet. Run a scan first.");
        const s = buildSummary(catalog, state);
        print(s, summaryText(s));
        return 0;
      }

      case "show": {
        if (!rest[0]) throw new UsageError("show needs a check id or finding id");
        const item = showItem(catalog, await readState(cwd), rest[0]);
        if (!item) throw new UsageError(`"${rest[0]}" is not a check or finding id`);
        print(item, JSON.stringify(item, null, 2));
        return 0;
      }

      case "queue": {
        const [op, ...refs] = rest;
        if (!["add", "remove", "clear", "list"].includes(op)) throw new UsageError("queue add|remove|clear|list [ids...]");
        if ((op === "add" || op === "remove") && !refs.length) throw new UsageError(`queue ${op} needs at least one check or finding id`);
        const state = await readState(cwd);
        const list = queue(catalog, state, op, refs);
        if (op !== "list") await writeState(cwd, state);
        print({ approved: list }, list.length ? `Approved to fix: ${list.length} findings\n${list.map((id) => `- ${state.findings[id].title} (${id})`).join("\n")}` : "Nothing approved to fix");
        return 0;
      }

      case "fixing": {
        if (!rest.length) throw new UsageError("fixing needs at least one check or finding id");
        // one commit per fix: a fix starts from a clean tree, or leftovers end up in its commit
        const dirty = await dirtyFiles(cwd);
        if (dirty.length) throw new UsageError(`There are uncommitted changes (${dirty.slice(0, 5).join(", ")}${dirty.length > 5 ? "…" : ""}). Finish the previous fix (recheck --commit) or undo it before starting the next one.`);
        const state = await readState(cwd);
        const changed = markFixing(catalog, state, rest);
        refreshCurrent(catalog, state);
        await writeState(cwd, state);
        print({ fixing: changed }, `✓ ${changed.length} findings marked as being fixed`);
        return 0;
      }

      case "checkpoint": {
        const state = await readState(cwd);
        const project = await loadProject(cwd);
        const cp = await checkpoint(cwd, project);
        state.checkpoints.push(cp);
        await writeState(cwd, state);
        print(cp, cp.kind === "git" ? `✓ Checkpoint saved (${cp.ref ?? "no commits yet"}${cp.created ? ", new commit" : ", nothing to commit"})` : `✓ Checkpoint saved: a copy of ${cp.files} files in ${cp.ref}`);
        return 0;
      }

      case "recheck": {
        if (!rest.length) throw new UsageError("recheck needs at least one check or finding id");
        const r = await recheck({ root: cwd, refs: rest, commitMessage: opts.commit, consent, catalog, checks, onProgress: progress });
        for (const e of r.errors) err(`! ${e}`);
        print(r, recheckText(r));
        return r.errors.length ? 1 : 0;
      }

      case "revert": {
        if (!rest[0]) throw new UsageError("revert needs a check or finding id");
        const r = await revert({ root: cwd, ref: rest[0], catalog, checks, onProgress: progress });
        print(r, `✓ Undid ${r.reverted}\n${recheckText(r)}`);
        return 0;
      }

      case "decide": {
        if (!rest[0]) throw new UsageError("decide needs a finding id, check id or category");
        const state = await readState(cwd);
        const r = decide(catalog, state, { ref: rest[0], action: opts.action, scope: opts.scope, reason: opts.reason });
        await writeState(cwd, state);
        await writeReport(cwd, catalog, state);
        print(r, `✓ ${r.action} ${r.scope} ${r.target}${r.changed.length ? ` (${r.changed.length} findings)` : ""} · score ${r.scoreBefore ?? "—"} → ${r.scoreAfter ?? "—"}`);
        return 0;
      }
    }
    return 0;
  } catch (e) {
    if (e instanceof UsageError || e instanceof ActionError) {
      err(e.message);
      return 2;
    }
    err(e instanceof CatalogError || e instanceof BrowserMissing ? e.message : `Sofia stopped: ${e.message}`);
    return 1;
  }
}

function factsText(detected) {
  return Object.entries(detected).map(([fact, { value, why }]) => `${value ? "✓" : "·"} ${fact.padEnd(6)} ${why}`).join("\n");
}

function summaryText(s) {
  const lines = [`${s.score ?? "—"} / 100 · ${s.verdict}`];
  if (s.blockers.length) lines.push("Blockers:", ...s.blockers.map((b) => `- ${b.title}`));
  lines.push(`Important · ${s.counts.important} · Polish · ${s.counts.polish}`);
  lines.push(`I can fix these · ${s.buckets.claude.length} · Need your choice · ${s.buckets.choice.length} · Need you to do something · ${s.buckets.user.length}`);
  if (s.needsConsent.length) lines.push(`Waiting for your OK: ${s.needsConsent.join(", ")}`);
  for (const n of s.notices) lines.push(`Note: ${n}`);
  return lines.join("\n");
}

function recheckText(r) {
  const lines = [];
  for (const f of r.fixed) lines.push(`✓ ${f.title}`);
  const back = new Set(r.reopened.map((f) => f.id));
  for (const f of r.stillOpen.filter((x) => !back.has(x.id))) lines.push(`✗ still failing: ${f.title}`);
  for (const f of r.reopened) lines.push(`↺ back again: ${f.title}`);
  for (const s of r.skipped ?? []) lines.push(`· not re-checked: ${s.id} — ${s.reason}`);
  lines.push(`${r.scoreBefore ?? "—"} → ${r.scoreAfter ?? "—"} · ${r.verdict}${r.commit ? ` · commit ${r.commit}` : ""}`);
  return lines.join("\n");
}
