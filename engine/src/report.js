import { writeFile } from "node:fs/promises";
import path from "node:path";
import { STATE_DIR } from "./state.js";
import { isCheckMuted } from "./score.js";

const SEVERITY = {
  blocker: ["Blockers", "will lose you users, money or data"],
  important: ["Important", "visitors will notice"],
  polish: ["Polish", "makes it look finished"],
};
const FIXER = { claude: "I can fix this", choice: "Your choice", user: "Your action" };
const ACTIVE = new Set(["open", "fixing"]);

function where(loc = {}) {
  const parts = [];
  if (loc.url) parts.push(`${loc.url}${loc.viewport ? ` at ${loc.viewport}px` : ""}`);
  if (loc.file) parts.push(`\`${loc.file}\`${loc.line ? ` line ${loc.line}` : ""}`);
  return parts.join(" · ") || "—";
}

function finding(f) {
  const lines = [
    `### ${f.title}`,
    "",
    `${f.impact}`,
    "",
    `- **Where:** ${where(f.location)}`,
    `- **Found:** ${f.evidence}`,
    `- **Fix (${FIXER[f.fixer]}):** ${f.fix}`,
  ];
  if (f.quotes?.length) {
    lines.splice(5, 0, `- **From the code** (a separate reviewer read it against a written checklist):`, ...f.quotes.map((q) => `  - \`${q.file}\` line ${q.line}: \`${q.text.trim()}\``));
  }
  if (f.options?.length) lines.push(...f.options.map((o, i) => `  ${i + 1}. ${o.label}${i === 0 ? " (recommended)" : ""}${o.detail ? ` — ${o.detail}` : ""}`));
  lines.push(`- <sub>\`${f.checkId}\`</sub>`, "");
  return lines.join("\n");
}

/**
 * Human-readable report (docs/06): header, score, tally, since last run, findings by severity,
 * then uncertain, accepted/deferred, muted and skipped.
 */
export function renderReport(catalog, state) {
  const run = state.runs.at(-1);
  const prev = state.runs.at(-2);
  const c = run.counts;
  const all = Object.entries(state.findings).map(([id, f]) => ({ id, ...f }));
  const muted = (f) => f.status === "muted" || isCheckMuted(catalog.byId.get(f.checkId) ?? {}, state.decisions);

  const out = [
    "# Sofia report",
    "",
    `Target: ${run.target} · ${run.mode} scan · ${run.finishedAt.replace("T", " ").slice(0, 16)} UTC`,
    "",
    `## ${run.score ?? "—"} / 100 · ${run.verdict}`,
    "",
    `Blockers ${c.blocker} · Important ${c.important} · Polish ${c.polish} · Passed ${c.passed} · Skipped ${c.skipped}${c.uncertain ? ` · Couldn't tell ${c.uncertain}` : ""}`,
    "",
    "## Since last run",
    "",
  ];
  if (!prev) out.push("First run — next time you'll see what changed.", "");
  else {
    const ch = run.changes;
    out.push(`${prev.score ?? "—"} → ${run.score ?? "—"} · ${ch.fixed.length} fixed · ${ch.new.length} new${ch.reopened.length ? ` · ${ch.reopened.length} back again` : ""}`, "");
    for (const id of ch.new) out.push(`- New: ${state.findings[id].title}`);
    for (const id of ch.reopened) out.push(`- Back again: ${state.findings[id].title}`);
    for (const id of ch.fixed) out.push(`- Fixed: ${state.findings[id].title}`);
    out.push("");
  }

  for (const sev of ["blocker", "important", "polish"]) {
    const list = all.filter((f) => f.severity === sev && ACTIVE.has(f.status) && !muted(f));
    if (!list.length) continue;
    out.push(`## ${SEVERITY[sev][0]} — ${SEVERITY[sev][1]}`, "", ...list.map(finding));
  }

  const sections = [
    ["Couldn't tell", all.filter((f) => f.status === "uncertain" && !muted(f))],
    ["Risk accepted", all.filter((f) => f.status === "accepted")],
    ["Later", all.filter((f) => f.status === "deferred")],
    ["Muted", all.filter((f) => muted(f) && f.status !== "fixed")],
  ];
  for (const [title, list] of sections) {
    if (list.length) out.push(`## ${title}`, "", ...list.map(finding));
  }

  const skipped = Object.entries(state.checks).filter(([, s]) => s.status === "skip");
  if (skipped.length) {
    out.push("## Skipped", "");
    for (const [id, s] of skipped) out.push(`- ${catalog.byId.get(id)?.title ?? id} — ${s.reason ?? "not relevant"} <sub>\`${id}\`</sub>`);
    out.push("");
  }
  return out.join("\n");
}

export async function writeReport(root, catalog, state) {
  await writeFile(path.join(root, STATE_DIR, "report.md"), renderReport(catalog, state));
}
