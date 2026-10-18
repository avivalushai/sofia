# 07 — Milestones

Build in this order. Don't start a milestone before the previous one's acceptance criteria pass. Report against the criteria at the end of each.

The value is in the engine and the chat flow. The dashboard comes after them on purpose: if the UI gets hard, there's still a working product.

---

## M0 — Scaffold

- Repo layout from `docs/02-architecture.md` (engine first; plugin wrapper can be thin for now)
- `engine/` with CLI skeleton, `catalog/checks.json` loaded and validated at startup (every check file's id must exist in the catalog; catalog entries without a file are reported as "not implemented")
- Test harness that serves `fixtures/broken-landing/` on a local port and runs the engine against it
- `PROGRESS.md`

**Accept when:** `launch-check run --target <fixture>` runs, finds zero checks implemented, writes a valid `state.json`, and the test harness passes.

## M1 — Engine core + mechanical checks

- `detect.js` with facts and reasons
- `runner.js`: applicability filter, parallel mechanical checks, deterministic finding ids
- `state.js` with atomic writes and merge across runs (first seen, last seen, fixed, new)
- `score.js` per docs/03
- `report.md` writer
- Mechanical v1 checks (roughly 25 — every `v1: true` + `layer: mechanical` entry)

**Accept when:** all mechanical rows in `fixtures/broken-landing/expected.json` match; two consecutive runs produce identical findings; `--mode quick` finishes in under 10 seconds on the fixture.

## M2 — Browser layer

- `browser.js` using `playwright-core` with `channel: "chrome"`; clear error if Chrome isn't found; never download a browser
- Shared crawler (`crawl.js`), cached per run, page limit configurable (default 30)
- Viewports 375 / 390 / 768 / 1280
- Screenshot store with element highlight
- axe-core integration
- Browser v1 checks

**Accept when:** all browser rows in `expected.json` match; each visual failure has a `before.png` with the offending element highlighted; full mode on the fixture under 2 minutes.

## M3 — Skill and conversation flow (chat only)

- `SKILL.md`: triggers (natural phrasings + command), the flow from docs/04, report wording from docs/06
- Detection summary + the single scan-target question
- Chat summary with the three fixer buckets
- Fix loop: checkpoint commit → fix → per-fix commit → `recheck` → before/after → score delta
- Decisions via AskUserQuestion, one at a time
- User-action checklist with exact values; "done" triggers recheck of those items
- Mute / accept / defer with scope and reason, persisted in state
- Re-run shows only the diff since last run

**Accept when:** on a copy of the fixture, the full transcript in docs/04 stages 1–6 can be reproduced end to end; reverting a single fix works; muting a category changes the score and persists across sessions.

## M4 — Complete v1 catalog

- All `v1: true` checks implemented (63), including consent-gated side-effect checks
- Judgment v1 checks stubbed as review tasks with rubrics written

**Accept when:** every v1 check has a fixture test; false-positive pass over 3 real apps (pick from the owner's projects) with results logged in `PROGRESS.md`.

## M5 — Dashboard, read-only

- Server per docs/02 (fixed port, reuse, SSE, idle shutdown, 127.0.0.1 only)
- UI per docs/05: header, tally, fixer cards (display only), since-last-run, findings list, detail drawer with before/after, muted & skipped tab, catalog tab
- Opened automatically on first run of a session; reused afterwards
- Live updates while Claude fixes

**Accept when:** during an M3 fix session the page updates within 1 second of each state change without refresh; restarting a run never opens a second tab; server exits after idle timeout.

## M6 — Dashboard actions + hook

- Queue, mute, accept, defer from the page → `pending` / `decisions` in state
- Pending bar with the "go back to Claude and type go" instruction
- `UserPromptSubmit` hook injects pending selections; skill acts and clears them
- Check current Claude Code docs for any way to notify a session from outside; if it exists, use it and keep the hook as fallback

**Accept when:** queue 3 fixes on the page, type "go" in chat, all 3 are fixed and verified, page shows them green, pending bar clears.

## M7 — Judgment layer

- `launch-reviewer` subagent with fresh context
- Engine emits review tasks; skill dispatches them; reviewer writes findings with quotes
- Rubrics for all judgment checks in v1

**Accept when:** reviewer findings include file+line quotes; running the same review twice gives the same pass/fail per rubric item on the fixture.

## M8 — Plugin packaging and distribution

- Read current Claude Code plugin docs; finalize manifest, commands, hooks and agent file formats
- Marketplace repo with install instructions in two lines
- English README with a 30-second GIF of the flow
- First-run experience: Chrome detection message, what the dashboard is

**Accept when:** a clean machine with Node and Chrome goes from install to first report in under 3 minutes following only the README.

## M9 — Rest of the catalog

Implement remaining checks by category, in this order: security → forms → data → mobile → content → design → sharing & search → everything else.

---

## Open questions to bring back to the owner

- Final product name (keep `launch-check` as the working id until then)
- Whether `decisions` should be committed to the repo by default
- Page limit for crawling large sites
- Whether quick mode should run automatically after Claude edits UI files (default: no; offer once before deploy only)
