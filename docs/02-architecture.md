# 02 — Architecture

> Intent, not final file names. Before packaging, read the current Claude Code docs for plugins, skills, commands, subagents and hooks, and adapt paths and manifest formats to match.

## Plugin layout (target)

```
launch-check/
  .claude-plugin/
    plugin.json                 manifest
  skills/
    launch-check/
      SKILL.md                  triggers + the conversation flow (docs/04)
      references/
        report-format.md        from docs/06
        fix-playbooks.md        how to fix each common finding
        rubrics/                one file per judgment check
  commands/                     /launch-check, /launch-fix (or skill-based commands, per current docs)
  agents/
    launch-reviewer.md          subagent for judgment checks, fresh context
  hooks/
    hooks.json                  UserPromptSubmit → inject pending dashboard selections
    pending-selections.js
  engine/
    package.json
    bin/launch-check.js         CLI entry
    src/
      cli.js
      detect.js                 project detection (framework, features)
      runner.js                 loads checks, filters by applicability, runs, writes state
      state.js                  read/write/merge .launch-check/state.json (atomic writes)
      score.js
      crawl.js                  shared crawler, result cached per run
      browser.js                playwright-core, channel "chrome", viewports
      shots.js                  screenshot storage
      server/                   dashboard server (http + SSE)
      checks/
        qa/broken-links.js
        resp/no-horizontal-scroll.js
        ...                     one file per check, path mirrors the id
  ui/
    dist/                       prebuilt dashboard (static)
```

## The three layers

| Layer | Runs as | Examples |
|---|---|---|
| `mechanical` | Node reading files, making HTTP/DNS requests | secrets in bundle, robots.txt, mail DNS records, copyright year |
| `browser` | Playwright driving the user's Chrome | horizontal scroll, console errors, dead buttons, contrast (axe-core) |
| `judgment` | Reviewer subagent against a rubric | server-side authorization, unclear error copy, mock data shown as real |

The engine runs mechanical and browser checks itself. For judgment checks it emits **review tasks** into the state file; the skill dispatches the reviewer subagent per task, and the subagent writes findings back through the CLI. The reviewer must get only the rubric and the relevant files, not the conversation.

## Engine CLI

```
launch-check detect                         print detected project facts
launch-check run --mode full|quick --target <url|local> [--only <ids|category>]
launch-check recheck <checkId...>           re-run specific checks, record before/after
launch-check review-tasks                   list pending judgment tasks
launch-check add-findings <file.json>       reviewer writes judgment results
launch-check decide <findingId> --action mute|accept|defer|unmute --scope instance|check|category --reason "..."
launch-check serve                          start or reuse the dashboard server, print URL
launch-check export --html <path>           single-file static report
```

All commands read and write `.launch-check/` in the current project. Output to stdout is short and machine-readable (JSON with `--json`), so the skill can parse it.

## Target selection

- **Live URL**: scan as given.
- **Local**: detect the dev command (`package.json` scripts), start it, wait for the port, scan, stop it afterwards (unless it was already running).
- Mechanical file checks always run against the project folder, regardless of target.

## Project detection (`detect.js`)

Produces facts used by `appliesWhen` in the catalog:

```
forms   mail   auth   db   shop   ai   he   i18n   dark   ads
```

Detection is heuristic (dependencies, file contents, rendered DOM). Each fact records *why* it was set, so the report can say "skipped 6 payment checks — no payment provider found".

## State file

`.launch-check/state.json` — the single source of truth. Atomic writes (write temp, rename). Shape:

```json
{
  "version": 1,
  "project": { "root": ".", "detected": { "forms": {"value": true, "why": "found <form> on /signup"} } },
  "runs": [
    { "id": "r_2026-10-18T12-00-00", "mode": "full", "target": "https://...", "startedAt": "...", "finishedAt": "...",
      "score": 58, "counts": { "blocker": 3, "important": 4, "polish": 2, "passed": 62, "skipped": 22 } }
  ],
  "findings": {
    "f_resp.no-horizontal-scroll_home_375": {
      "checkId": "resp.no-horizontal-scroll",
      "status": "open",
      "severity": "blocker",
      "fixer": "claude",
      "title": "The page scrolls sideways on mobile",
      "impact": "On iPhone the page drags left and right, and the sign-up button is cut off",
      "location": { "url": "/", "viewport": 375, "file": "src/components/PriceTable.tsx", "line": null },
      "evidence": "Pricing table is 38px wider than the screen at 375px",
      "fix": "Stack the cards in one column on narrow screens",
      "shots": { "before": "shots/f_resp.../before.png", "after": null },
      "firstSeenRun": "r_...", "lastSeenRun": "r_...",
      "history": [ { "at": "...", "event": "opened" } ]
    }
  },
  "decisions": [
    { "scope": "category", "target": "mail", "action": "mute", "reason": "No email in this app", "at": "..." }
  ],
  "pending": {
    "fix": ["f_..."], "decide": [], "updatedAt": "...", "source": "dashboard"
  },
  "reviewTasks": [ { "checkId": "sec.server-authz", "rubric": "rubrics/sec.server-authz.md", "files": ["app/api/..."], "status": "pending" } ]
}
```

Finding statuses: `open`, `fixing`, `fixed` (verified by recheck), `muted`, `accepted` (risk accepted), `deferred`, `uncertain` (e.g. external site blocks bots).

Finding ids are deterministic (`checkId` + location key) so re-runs match the same finding.

## Screenshots: before and after

- When a visual check fails, it saves `before.png` at the failing URL and viewport.
- `recheck` after a fix saves `after.png` the same way.
- If the user fixed something outside the skill, the next run finds the previous `before.png` and saves a new `after.png`.

```
.launch-check/shots/<findingId>/before.png
.launch-check/shots/<findingId>/after.png
```

## Dashboard server

- Fixed preferred port (pick one unlikely to clash, e.g. `4319`), fall back to the next free one. Record it in `.launch-check/server.json` with the pid.
- **Reuse** a running server instead of starting another. Never open a second tab for the same project; the page shows a "New run" toast instead.
- Serves `ui/dist` plus a tiny API:
  - `GET /api/state` — full state
  - `GET /api/events` — Server-Sent Events; emits on every state file change (fs.watch, debounced)
  - `POST /api/pending` — the page queues selections
  - `POST /api/decide` — mute / accept / defer from the page
  - `GET /shots/...` — screenshots
- Binds to `127.0.0.1` only.
- Shuts itself down after 30 minutes with no connected page and no state changes.

## Page → Claude: the gap and the bridge

Claude acts only when the user sends a message. The page cannot wake it.

- **Claude → page**: automatic. Claude writes state, the page updates over SSE.
- **Page → Claude**: the page writes `pending` to state. The `UserPromptSubmit` hook reads it on the next message and injects a short note into Claude's context ("User queued 5 fixes from the dashboard: …"). The skill then acts and clears `pending`.
- The page must say this plainly: "5 items queued. Go back to Claude and type **go**."
- Before building, check the current docs for any supported way to notify a session from outside; if one exists, prefer it and keep the hook as fallback.

## Reviewer subagent

- Runs judgment checks only. Input: rubric file + listed files + check id. Output: findings JSON matching the schema in docs/03.
- Must not see the main conversation, so it isn't biased by what was built.
- Must answer `pass`, `fail` or `uncertain` per rubric item, quoting the file and line it relied on.

## Dependencies (keep it lean)

- `playwright-core` — browser control via installed Chrome
- `axe-core` — accessibility rules injected into pages
- `lighthouse` — performance metrics (optional in quick mode)
- A spell checker that supports English and Hebrew dictionaries (evaluate options; Hebrew support is a requirement, verify it works before choosing)
- Node built-ins for HTTP, DNS, fs

Anything else needs a reason in `PROGRESS.md`.
