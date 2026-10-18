# Progress

## Done

### M2 — Browser layer (2026-10-18)
- `browser.js`: the user's installed Chrome via `playwright-core` (`channel: "chrome"`), headless; never downloads a browser; a clear "install Chrome" message if it can't start. Shared pages per URL+width for read-only checks (kept loaded, at most 10 open), isolated fresh pages for checks that click or type. Console errors, page errors, every request, failure and status are recorded per page.
- Rendered crawl (`crawl.browserPages()`), at desktop width, same 30-page limit (now `--max-pages`).
- Viewports 375 / 390 / 768 / 1280.
- Screenshots: `.launch-check/shots/<findingId>/before.png`, with the element outlined in red. A finding fixed in a later run gets `after.png` from the same page and width; one that comes back loses its after shot.
- axe-core for contrast and button names.
- All 29 v1 browser checks, each with an `expected.json` row (17 rows added, none changed).
- `--target local`: runs the project's dev script on a free port (or serves a plain HTML folder) and stops it afterwards.
- Consent: `--consent submit-forms[,test-accounts]`. Effective only against a local target, or with `--staging`. A check waiting for consent is skipped with `needs` set, so the skill knows what to ask.
- Tests: 105 (104 pass, 1 skipped = `shop.checkout-flow`, not v1). Full mode on the fixture ~21 s, quick mode ~0.5 s.

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
- Nothing. Next: M3 (skill and conversation flow).

## Dependencies (with reasons)
- `htmlparser2` (MIT) — real HTML parsing for the mechanical checks; regex parsing would be a steady source of false alarms.
- `hunspell-asm` (MIT) — Hunspell compiled to WebAssembly. Hebrew loads in 0.3 s and checks are instant. `nspell` (pure JS) was tried first and took over 2 minutes just to load the Hebrew dictionary.
- `dictionary-en` (MIT AND BSD) — English dictionary.
- `dictionary-he` (**AGPL-3.0**) — Hebrew dictionary (from Hspell). See open questions.
- `playwright-core` (Apache-2.0) — drives the installed Chrome. Doesn't download browsers.
- `axe-core` (MPL-2.0) — accessibility rules.
- Not added: `lighthouse`. `perf.lcp` measures the same thing directly through Chrome (throttled CPU + "Slow 4G"), without Lighthouse's ~30 MB of dependencies.

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

## Additions to the state shape in M2 — please confirm
- `checks[id].needs`: the consent a skipped check is waiting for (`submit-forms`, `test-accounts`).

## Deviations from the docs (M2)
- `--target local` always starts its own copy on a free port instead of reusing a server already running on the usual port (docs/02). Reason: during M1 a different project's server was sitting on the port I tried, and the scan silently read that app. Starting our own copy means we always scan the right app.
- `a11y.form-labels` uses its own rule instead of axe-core: axe accepts a placeholder as a label, but `expected.json` (rightly) doesn't — the placeholder vanishes once you type.

## Known limits of the browser checks
- `sec.idor` needs two test accounts and the app's sign-in flow; until the skill collects them (M3) it answers "couldn't tell" (or is skipped without consent).
- `perf.lcp` is a timing: median of 3 runs on the first 3 pages, failing above 4 s. Near the threshold it can flip between runs.
- `qa.loading-states` and `qa.error-states` only look at pages that fetch data after loading, and fail only when 200+ characters of content are missing with nothing said — deliberately conservative.
- `qa.dead-buttons` clicks at most 15 buttons per page; every request that would change something is answered by Launch Check itself, so clicks can't change real data.
- The form checks never send test data to a different address on the developer's machine than the site itself.
- The "Chrome not found" message isn't covered by an automated test (it would need a machine without Chrome).

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
