# Progress

## Done

### M0 — Scaffold (2026-10-18)
- Repo root is the plugin root: `.claude-plugin/plugin.json`, `skills/launch-check/SKILL.md` (placeholder, model invocation off until M3), `engine/`, `catalog/`. `docs/` and `fixtures/` are for development only.
- `engine/` CLI (`bin/launch-check.js` → `src/cli.js`). `run` works; the other commands say "not implemented yet".
- `src/catalog.js` checks `catalog/checks.json` on every start: required fields, allowed layer/severity/fixer/appliesWhen values, unique ids, id prefix = category, count. It also loads `src/checks/**`: a file whose id isn't in the catalog, sits at the wrong path or has the wrong layer stops the run. Catalog entries with no file are reported as not implemented.
- `src/state.js`: the doc-02 state shape, atomic writes (temp file, then rename), structural validator.
- `src/runner.js`: checks the target is a URL and reachable, records a run. Run ids get a `-2`, `-3`… suffix when two runs share a second.
- Test harness (`npm test` in `engine/`, Node's built-in test runner): serves `fixtures/broken-landing/` on a free port with a plain default 404, runs the CLI in a temporary project folder, validates `state.json`. 13 tests.
- No npm dependencies yet.

## In progress
- Nothing. Next: M1 (engine core + mechanical checks).

## Decisions taken (owner OK'd 2026-10-18)
- Score with nothing to count is `null`, with verdict `"No checks yet"`.
- Run ids add `-2`, `-3`… on collision.
- Repo root = plugin root.

## Additions to the state shape (not in docs/02)
- `runs[].verdict`: stored next to `score`, needed for the `null` case.
- `runs[].counts.notImplemented`: so a report can say how much of the catalog actually ran.

## Notes from the current Claude Code docs
- `commands/` is deprecated; `/launch-check` and `/launch-fix` will be skills (no `commands/` folder).
- `${CLAUDE_PLUGIN_ROOT}` = plugin install folder; `${CLAUDE_PLUGIN_DATA}` survives plugin updates (a candidate for `node_modules` once playwright-core arrives in M2).

## Open questions
- `--target local` (start the dev server) isn't built yet. Which milestone should it land in? Proposal: M2, together with the browser layer.
- `--only` is accepted but has no effect until there are checks to filter (M1).
- From docs/07: final product name; whether `decisions` get committed by default; crawl page limit; whether quick mode runs automatically after UI edits.
