# Progress

## Done

### M1 — Engine core + mechanical checks (2026-10-18)
- `detect.js`: the 10 facts, each with a reason whether true or false. Reads `package.json`, source files and the crawled pages.
- `crawl.js`: plain-HTTP crawler (no JavaScript), same origin, breadth-first, deterministic order, 30-page limit, identical pages de-duplicated. The browser crawl in M2 sits next to it.
- `runner.js`: applicability filter (`appliesWhen` → skip with the fact's reason), mode filter (quick = mechanical; full = mechanical + browser), `--only` by id or category, 8 checks in parallel, 60 s timeout per check. Network trouble → "couldn't tell", never "fail". A crashed check is reported and the run exits 1.
- `state.js` `mergeRun`: first/last seen, opened → fixed → reopened, history per finding. "Fixed" only when the check re-ran with a real answer and the finding's page loaded this run. Mutes are kept.
- `score.js` per docs/03 (10/4/1, cap 69 with an open blocker, accepted/deferred count as failing but don't block, muted and uncertain left out, check- and category-level mutes honoured).
- `report.js`: `.launch-check/report.md` with the six parts per finding, since-last-run, couldn't-tell / accepted / later / muted / skipped sections.
- `detect` CLI command.
- All 27 v1 mechanical checks, each with an `expected.json` row (13 rows added, none changed).
- On first run, `.launch-check/` is added to the project's `.gitignore` if the project uses git (docs/06).
- Tests: 82 (69 pass, 13 skipped = browser rows + not-built `shop.checkout-flow`). Quick mode on the fixture: ~0.5 s.

### M0 — Scaffold (2026-10-18)
- Repo root is the plugin root: `.claude-plugin/plugin.json`, `skills/launch-check/SKILL.md` (placeholder, model invocation off until M3), `engine/`, `catalog/`. `docs/` and `fixtures/` are for development only.
- `engine/` CLI, catalog validation on every start, atomic state writes, test harness serving `fixtures/broken-landing/` on a free port with a plain default 404.

## In progress
- Nothing. Next: M2 (browser layer).

## Dependencies (with reasons)
- `htmlparser2` (MIT) — real HTML parsing for the mechanical checks; regex parsing would be a steady source of false alarms.
- `hunspell-asm` (MIT) — Hunspell compiled to WebAssembly. Hebrew loads in 0.3 s and checks are instant. `nspell` (pure JS) was tried first and took over 2 minutes just to load the Hebrew dictionary.
- `dictionary-en` (MIT AND BSD) — English dictionary.
- `dictionary-he` (**AGPL-3.0**) — Hebrew dictionary (from Hspell). See open questions.

## Decisions taken (owner OK'd 2026-10-18)
- Score with nothing to count is `null`, verdict `"No checks yet"`.
- Run ids add `-2`, `-3`… on collision.
- Repo root = plugin root.
- `runs[].verdict` and `runs[].counts.notImplemented` added to the state shape.

## Additions to the state shape in M1 (not in docs/02) — please confirm
- Top-level `checks`: `{ [checkId]: { status: pass|fail|skip|uncertain, reason?, lastRun } }`. Needed to compute the score from state alone (for `recheck` later) and to show *why* a check was skipped.
- `runs[].changes`: `{ new, fixed, reopened }` finding ids — powers "since last run" in chat, report and dashboard.
- `runs[].pages` (pages scanned) and `runs[].only` (when `--only` was used).
- `runs[].counts` now also has `uncertain`, `muted`, `accepted`, `deferred`. Severity counts are **per check**, not per finding: a check failing on 3 pages is one blocker (matches passed/skipped, which were already per check).
- Finding ids: `f_<checkId>_<key>`. Page findings use the page path ("/" → `home`); code findings use file + a hash of the line text, so editing other lines doesn't change the id.

## Known limits of the mechanical checks
- The HTTP crawl doesn't run JavaScript: pages that build their content in the browser look empty to it. The M2 browser crawl covers those.
- `env.missing-vars` can't see the host's settings; it flags variables the code needs that aren't defined in *any* env file or host config in the project.
- `sec.open-db` reads access rules saved in the project (Supabase migrations, Firebase rules files). It doesn't yet try a read without logging in; when no rules are saved it answers "couldn't tell".
- `mail.auth` checks DKIM only for providers whose record name is known (Resend, SendGrid, Mailgun, Brevo, Google).
- `launch.https-redirect`, `launch.ssl-valid` and `mail.auth` skip or don't apply on the local fixture, so only their logic is tested, not a live target. The M4 pass over real apps covers that.

## Open questions
- **Hebrew dictionary licence.** The only good Hebrew dictionary (Hspell) is AGPL-3.0. Fine for development; before distributing (M8) decide between: ship it as-is (AGPL obligations may extend to the plugin), download it on first use, or drop Hebrew spell-checking.
- `--target local` (start the dev server): proposed for M2.
- From docs/07: final product name; whether `decisions` get committed by default; crawl page limit; whether quick mode runs automatically after UI edits.

## Notes from the current Claude Code docs
- `commands/` is deprecated; `/launch-check` and `/launch-fix` will be skills.
- `${CLAUDE_PLUGIN_ROOT}` = plugin install folder; `${CLAUDE_PLUGIN_DATA}` survives plugin updates (a candidate for `node_modules`).
