# Launch Check — build brief

You are building **Launch Check** (working name): a Claude Code plugin that scans an app before launch, finds what's broken, and helps the user fix it — through a conversation with Claude *and* a local dashboard page.

The people who use it build apps with Claude or Cursor but are not developers. They don't know what to check. Launch Check knows, checks it the same way every time, and fixes most of it for them.

## First thing in a new project

If this folder isn't a git repository yet, run `git init`, add everything, and commit with the message "Build brief" before doing anything else. Don't ask; just do it and mention it in one line.

## Read these first, in order

1. `docs/01-product.md` — who it's for, what it must feel like, principles
2. `docs/02-architecture.md` — plugin layout, engine, layers, state file, server, hook
3. `docs/03-check-contract.md` — how a single check is written, result schema, scoring
4. `docs/04-conversation-flow.md` — the exact chat flow, with transcripts
5. `docs/05-dashboard-ui.md` — the local page
6. `docs/06-report-format.md` — how findings are worded in chat and on the page
7. `docs/07-milestones.md` — build order and acceptance criteria
8. `catalog/checks.json` — all 175 checks (source of truth for ids, layer, severity, fixer, applicability)
9. `fixtures/broken-landing/` — a deliberately broken site to test against, with `expected.json`

Do not start coding before reading 01–03 and 07.

## Non-negotiables

- **Deterministic first.** Every check that *can* be a script is a script. Claude's judgment is used only for checks marked `layer: "judgment"`, and only against a written rubric. Same input → same report.
- **One source of truth.** All results, decisions and fix status live in `.launch-check/state.json` in the user's project. The chat and the dashboard both read and write it. Nothing important lives only in Claude's context.
- **Verify, don't claim.** A finding is "fixed" only after its check re-runs and passes. Never mark something fixed because code was edited.
- **No side effects without consent.** Submitting real forms, sending email, hitting rate limits, making purchases — only against local or staging, only after the user says yes.
- **Checkpoint before fixing.** Create a git commit (or stash-equivalent if no git) before the first fix in a session. Each fix is its own commit so it can be reverted alone.
- **Plain language in user-facing text.** Describe the consequence ("a link shared on WhatsApp will look empty"), not the technology ("missing og:image").
- **Use the user's Chrome.** `playwright-core` with `channel: "chrome"`. Never trigger a browser download. Assume Node and Chrome exist; fail with a clear message if not.
- **No paid APIs inside checks.** Every check is free to run.

## Working conventions

- Engine: Node ≥ 20, ESM, no TypeScript build step required (JSDoc types are fine). Keep dependencies few.
- Dashboard: static files shipped prebuilt inside the plugin. No build step at install time.
- Every check gets a test against `fixtures/` before it's considered done.
- Check ids are stable forever. Never rename; deprecate instead.
- When unsure about current Claude Code plugin, skill, hook or command conventions, **read the current Claude Code docs before guessing.** The architecture doc describes intent; the docs decide the exact file names and formats.

## How to work with me (the owner)

- I steer scope and the data model; you decide cosmetics.
- Work milestone by milestone (`docs/07-milestones.md`). At the end of each milestone, show me the acceptance criteria and how each was met.
- Keep a running `PROGRESS.md` at the repo root: done, in progress, open questions.
