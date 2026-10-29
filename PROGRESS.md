# Progress

## Done

### M7, judgment checks: a separate reviewer reads the code (2026-10-25)
- 7 rubrics in `skills/check/references/rubrics/`: `leftover.mock-data`, `leftover.unwired-ui`, `qa.empty-states`, `content.terms`, `sec.server-authz`, `sec.rate-limit` and `ai.output-as-code`. A rubric is a set of numbered yes/no questions with pass and fail examples. A judgment check counts as "built" once its rubric exists.
- The engine doesn't judge. In a full scan it prepares a **review task** for each judgment check that applies: the rubric plus the files worth reading. When a check reads wording, the task also gets the pages' visible text (`.launch-check/review/pages.txt`). A fingerprint of the rubric and the files means unchanged code keeps its earlier review. A check with nothing to read is skipped and the reason is stated.
- `agents/reviewer.md`: a separate agent with fresh context and read-only tools (Read, Grep, Glob). It answers every question pass, fail or uncertain, quotes a `file:line` for each answer, and replies in JSON. When the thing a question asks about doesn't exist in the app, the answer is "pass" with "Doesn't apply:"; "uncertain" is only for something that exists but can't be decided.
- `add-findings` accepts a review only if every quote really is on that line of that file and inside the project, every failing answer has a finding, every finding has quotes, and every "choice" check has 2–3 options. Anything else is rejected with the reason, and the skill retries once.
- In chat, Sofia explains the step once in plain words ("a second opinion: … a separate reviewer that hasn't seen our conversation … has to quote the exact line"), then starts the reviewers in parallel.
- On the report page and in report.md, a reviewer's findings carry the quoted lines and the note "Found by a separate reviewer". The page header shows "Code review · N waiting" while reviews are pending.
- Fixture `fixtures/judgment-app/`: a Hebrew notes app with one planted problem for each judgment check. Tests: `engine/test/judgment.test.js`.
- Consistency: four independent reviewers ran the three hardest checks twice (server permissions, rate limit, empty states). Their answers were identical question by question. An earlier round differed on 2 questions, which led to the "Doesn't apply → pass" rule and to rewriting the rate-limit rubric as 3 plain yes/no questions.
- Still to do: run the reviewers on a real app (part of the validation pass).

### M5, read-only page, pulled forward at the owner's request (2026-10-19)
- `serve`: one local server per project on 127.0.0.1, preferred port 4319, falling back to the next free one, recorded in `.launch-check/server.json`. A running server is reused, never a second one. Stops after 30 idle minutes.
- API: `/api/state` (state, summary, catalog), `/api/events` (live updates on every state change, debounced 150 ms), `/shots/…`.
- The page (`ui/dist`, vanilla, no build step), following docs/05:
  - Header: score dial, verdict, live status ("Sofia is fixing 3 items" / "Approved to fix · N").
  - Tally filters, the three fixer cards (display only), since last run.
  - Findings grouped by severity, fixer or category: one row per check with "N places".
  - A details drawer with every place, before/after screenshots, the fix (steps for "your action"), options and the check id.
  - A tab for muted, accepted and skipped items, and a tab with all checks.
  - Light and dark themes, `dir="auto"` for Hebrew, fixer chips told apart by shape (solid, outlined, dashed).
- The skill opens the page after each scan.
- Not yet (M5/M6): queue, mute and decide buttons on the page, an export to a single file, an automatic browser tab on first run, and the before/after slider.

### M4 so far — false-positive pass, part 1 (2026-10-19)
- NehoRace: 13 findings on the first scan, 9 of them false. After the fixes, 3 findings, all real, plus 5 "couldn't tell" with reasons.
- Blockout: 2 false alarms and 1 missed finding (Amplitude before consent), all fixed.
- Engine changes:
  - Bot-protection detection.
  - Probes trimmed, spaced out and run last.
  - A blocked page is told apart from a blocked sub-request.
  - Server functions and other local services that can't run in a local copy.
  - Hebrew spelling relies only on strong signals.
  - `.env` files are read even when git ignores them.
  - The live address is taken from the README too.
  - Tailwind gray scales are accepted.
  - A bare `http://localhost` parsing base is ignored.
  - Amplitude endpoints and cookies are recognized.
  - The library-count title is fixed, with a "They're there on purpose" option.
- Tests: 124 (123 pass, 1 skipped). 6 new tests in `realworld.test.js`.

### M3 — Skill and conversation flow (2026-10-18)
- `skills/launch-check/SKILL.md`: triggers (natural phrasings and the command, with `quick`), the docs/04 flow stage by stage, the docs/06 wording rules, and the smaller conversations (mute, disagree, why, undo, unclear link). References: `report-format.md`, `fix-playbooks.md` (how to fix every v1 check), `conversation-examples.md`.
- `skills/launch-fix/SKILL.md`: picks up from the saved state; command only.
- New engine commands for the skill:
  - `detect` with no target: facts from the project files, checks skipped per fact, live-address guesses, how to start it locally.
  - `summary`: score, blockers by name, the three fixer groups as items (one per check), since last scan, parked items, consent needed, notices.
  - `show`, `fixing`, `checkpoint`, `decide`.
  - `recheck`: commits a fix only if it passes; takes check ids, finding ids or categories.
  - `revert`: undoes one fix with `git revert`, then rechecks.
- Safety:
  - A checkpoint commit before the first fix.
  - `fixing` refuses to start on top of uncommitted changes, so each fix is its own commit.
  - A yes to test submissions lasts 12 hours.
  - Without git, the checkpoint is a copy of the project files.
- Walkthrough of docs/04 stages 1–7 on a copy of the fixture: `docs/walkthroughs/m3-noa-pilates.md`. Real commands, real edits, one commit per fix, 52 → 69 → 94, then 97 after the Stage 7 re-run. It found 11 gaps; all are fixed and listed there.
- `claude plugin validate .` passes, with 2 warnings for M8: no author yet, and `CLAUDE.md` at the plugin root.
- Tests: 118 (117 pass, 1 skipped = `shop.checkout-flow`, not v1). New: 13 session tests (checkpoint, failing fix not committed, one commit per fix, undo one fix, category mute persisting across processes, accept and defer, since-last-run, the clean-tree guard, consent per session, local 404 page, partial share-image address).

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
- **M9, the rest of the catalog (started 2026-10-29): all 112 built.** Still to do: a full scan of the real apps with every check. Order: security → forms → data → mobile → content → design → sharing & search → the rest.
  - Security, 7 of 7 built:
    - In code: `sec.headers`, `sec.cookies`, `sec.cors`, `sec.source-maps`.
    - In the browser: `sec.mixed-content`.
    - Code review: `sec.xss-output`, `sec.login-limit`.
  - Forms, 6 of 6:
    - Mechanical: `forms.input-types`, `forms.autocomplete`, `forms.enterkey`, `forms.spam`, `forms.backup`. The fields are read from the source files (HTML, JSX, Vue, Svelte), so apps that build their pages in the browser are covered too. Hidden trap fields are ignored.
    - Code review: `forms.thank-you`.
  - Data, 1 of 1: `data.delete-export` (code review).
  - Mobile, 5 of 5 (in the browser): `resp.text-size`, `resp.orientation` (a phone in landscape), `resp.safari-ios` (100vh sections whose bottom hides under Safari's bar), `resp.fixed-overlap` (links under a floating element, checked at the top and the bottom of the page, where scrolling can't uncover them), `resp.tablet` (768 and 1024: overlapping links and buttons, sideways scrolling at 1024). Cookie banners and full-screen menus aren't counted as floating elements.
  - Content, 4 of 4:
    - Mechanical: `content.file-names` (Screenshot…, IMG_1234, "(1)", final_v2, random hashes in published media).
    - Code review: `content.button-labels`, `content.error-copy`, `content.404-copy`. The last one runs only when the site has its own not-found page; `qa.custom-404` covers sites without one.
  - Design, 7 of 7:
    - Browser: `design.type-scale`, `design.spacing-scale`, `design.radius-shadow`, `design.input-families`, `design.dark-mode`, `design.focus-hover`.
    - Mechanical: `design.icon-sets`.
    - Spacing flags odd pixel values (5, 7, 13, 21…), not values off a 4px grid, because Tailwind's own steps include 6, 10 and 14. The browser's default heading and paragraph margins are ignored.
    - Dark mode turns on the system setting, a `dark` class and a saved theme. A site that stays light under all three gets "couldn't tell", since its dark mode needs a toggle.
    - **Decision (mine): `design.focus-hover` checks the mouse only.** Keyboard focus belongs to `a11y.focus-visible`, so one problem doesn't produce two findings.
  - Sharing and search, 6 of 6 (mechanical):
    - The checks: `seo.description`, `seo.share-image` (reads the size from the file's first bytes), `seo.single-h1` (on the rendered page when the browser runs), `seo.sitemap` (every listed address is opened), `seo.canonical` (missing on every page, several pages claiming one address, or a test address on a live site), `seo.ssr` (words as sent vs. after scripts).
    - On a local copy, the sitemap and the share image point to the live domain, so the same paths are opened on the local copy instead.
  - AI agents, 7 of 7:
    - `agent.semantic`, `agent.schema`, `agent.llms-txt` and `agent.crawler-policy` (the choice: allow AI answers but not training, allow everything, or block everything).
    - In the browser: `agent.prices-text` and `agent.forms-fillable` (no submit button, fake fields, gestures).
    - `agent.bot-wall` opens the live site as ChatGPT-User, Claude-User and Perplexity-User. When an ordinary request is blocked too, the result is "couldn't tell".
    - New check flag `expectsBlocks`: for this check, a challenge page is the answer itself, not a reason to give up.
  - Accessibility, 6 of 6:
    - Browser: `a11y.keyboard` (Tab traps, and click-only controls), `a11y.focus-visible` (the look before and after focus).
    - Mechanical: `a11y.headings`, `a11y.zoom`, `a11y.motion`, `a11y.statement` (required by Israeli law; the fix lists what the statement must contain).
  - Hebrew and other languages, 7 of 7:
    - `rtl.icons` (forward and back arrows pointing the left-to-right way, unless flipped) and `rtl.mixed-text` (an English sentence in a right-to-left block, or a Hebrew sentence forced left to right).
    - `rtl.switcher`: flagged only when the other language actually has the same page.
    - `rtl.hreflang`: the language versions must point to each other.
    - `rtl.dates`, `rtl.currency` (NIS in Hebrew text, a dot for thousands, ₪ on both sides) and `rtl.phone` (the field must accept 0501234567 and 050-1234567).
    - New test apps `fixtures/broken-he` and `fixtures/clean-he`: a Hebrew site with an English version.
  - Quality, 3 of 3:
    - `qa.external-links`: dead means the domain doesn't exist or the page answers 404/410. Social sites that block bots are skipped. When nothing answers, it first checks whether this machine is online.
    - `qa.anchors` and `qa.orphan-pages`. Thank-you, admin, auth and similar pages count as unlinked on purpose.
  - Performance, 8 of 8:
    - On a slow phone (Slow 4G, CPU ×4): `perf.cls` and `perf.inp`.
    - `perf.images-format`: dimensions measured at desktop width, plus heavy PNG photos.
    - `perf.lazy-load`, `perf.bundle-size` (compressed; skipped on a local dev server, which doesn't bundle), `perf.fonts` (text hidden until the font loads; file count and weight), `perf.cache` (live only), `perf.third-party`.
    - Chrome marks load-time layout shifts as "after input" under touch emulation, so `perf.cls` ignores that flag.
  - Tests run 3 files at a time (`--test-concurrency=3`), and the test apps are scanned one after another. With everything in parallel, Chrome instances starved each other and checks timed out.
  - `LC_TIMINGS=1` prints how long each check took.
  - Email (5), shop (6), launch (6) and operations (5):
    - Mechanical: `mail.real-sender` (Gmail, sendmail or PHP mail()), `mail.reply-to`, `mail.unsubscribe` (comments ignored), `shop.israeli-payment`, `shop.invoices` (Morning, iCount, EZcount…), `run.error-tracking`.
    - Live only: `launch.canonical-host`, `launch.dns` (including dangling CNAMEs), `launch.custom-domain`, `launch.redirects-old` (old addresses from the Internet Archive), `run.ssl-expiry` and `run.domain-expiry` (RDAP; .il domains give "couldn't tell"). All are tested with the network stubbed out.
    - `launch.staging-noindex` runs when the scanned address is a preview or staging address. From the real domain, how the host handles previews isn't visible.
    - Code review: `shop.vat` (18% since January 2025; consumer prices must include VAT). Planted in `judgment-app`: a 17% rate.
  - **Guided checks (a decision for you to confirm):** some checks can't be verified from outside, or need a real email or purchase: `mail.spam-score`, `mail.system-emails`, `shop.checkout-flow`, `shop.test-purchase`, `shop.order-emails`, `launch.sitemap-submitted`, `run.uptime`, `run.backup`. They answer "couldn't tell", with exact steps for the user (`lib/guided.js`). They pass only when there's evidence: a Search Console verification tag, an uptime monitor named in the project, a backup job, or an invoicing service in the code. "Couldn't tell" doesn't lower the score.
  - Detection now recognises mail and payment libraries imported in code (not only listed in package.json), and Israeli payment providers.
  - Without Chrome (quick mode), browser checks that don't apply are now recorded as "doesn't apply" instead of being left out.
  - `perf.cls` also checks the cause, images and videos near the top with no reserved space, so its answer no longer depends on how fast the machine is.
  - The last 23 (privacy, analytics, AI, cost, libraries, leftovers, behaviour):
    - Mechanical: `privacy.terms` (the linked page must open), `privacy.session-replay` (Hotjar, Clarity, LogRocket… without masking), `analytics.internal`, `ai.limits` (max_tokens and a timeout), `deps.vulnerable` (osv.dev, from the lockfile; HIGH and CRITICAL only), `deps.heavy`, `leftover.duplicate-files`, `leftover.dead-code` ("couldn't tell" when the code loads files by pattern).
    - Browser: `privacy.cookie-reject`, `analytics.installed`, `analytics.double-fire`, `analytics.pixels`.
    - Behaviour, in the browser: `behave.refresh`, `behave.back-button`, `behave.slow-network` (Slow 3G; text faded out or hidden doesn't count as shown) and `behave.extreme-input` (Hebrew and accented names against strict patterns; a long word breaking the layout).
    - Code review: `privacy.policy-matches`, `privacy.licenses`, `privacy.third-party-data`, `analytics.conversions`, `ai.prompt-injection`, `cost.per-load`, `cost.free-tier`. Each was planted in `judgment-app` and run twice with real reviewers; both matched on every question.
  - **All 175 checks in the catalog are built.**
  - A lesson from `deps.vulnerable`: lodash 4.17.21, long "the safe version", has a HIGH advisory fixed in 4.18.0. Its test depends on live data and says so.
  - `add-findings` now accepts a reviewer reply wrapped in a Markdown code fence.
  - Every new code-review check was run twice with real reviewers on `fixtures/judgment-app`. The answers matched question by question, and the quotes passed verification.
  - New test apps:
    - `fixtures/broken-app/` has one planted problem for each new check.
    - `fixtures/clean-app/` is the same app with every problem fixed, so every check must pass there; it guards against false alarms.
    - Test: `engine/test/apps.test.js`.
  - The parts that only run against a live site are tested with the network stubbed out (`engine/test/live-paths.test.js`).
  - On a local copy, `sec.headers` reads the host settings files (vercel.json, netlify.toml, _headers, next.config…). When the project has none, the result is "couldn't tell", not "fail".
- M4: false-positive pass over real apps. NehoRace and Blockout are done (`docs/walkthroughs/m4-real-apps.md`). Still to do: a live re-scan of both once Vercel stops challenging this machine, a third app (one with a form, login or database), and the `clean-landing` / `app-with-auth` fixtures.

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

## Additions to the state shape in M3 — please confirm
- `current`: `{ score, verdict, counts, at }`, recomputed on every change (decisions change the score without a run).
- `checkpoints[]`: `{ kind: git|copy, ref, created, at }`.
- `runs[]`: `kind` (`scan` | `recheck`), `targetSpec` (`local` or the URL, so a recheck can reach the same target), `consent`, `staging`, `scoreBefore`.
- `findings[].fixCommits`: the commits that fixed it, used by `revert`. A history event `fixing`, and `fixed` events carry the `commit`.
- `decisions[]` also records instance-level accept, defer and mute, with the finding id as `target`.

## Additions to the state shape in M7 — please confirm
- `reviewTasks[]`: `{ id, checkId, run, rubric, files, fingerprint, status: pending|done, result?, answers?, reviewedAt? }`.
- `findings[].quotes`: `[{ file, line, text }]`, the lines a reviewer quoted, each one verified against the code.
- `runs[].reviewsPending`: how many reviews the run left waiting.

## Owner decision 2026-10-19: the tool is called Sofia
- **Plugin and commands:** the plugin is `sofia`. The commands are `/sofia:check` (scan) and `/sofia:fix` (the approved fixes).
- **Triggers:** the skill triggers on the name ("Sofia, check my app" / "סופיה"), so it isn't confused with other checker skills installed alongside (the owner has `secute`).
- **User-facing text:** chat, report title, commit messages ("Sofia: …") and the git fallback identity all say Sofia.
- **Still internal:** the engine (`launch-check.js`), check ids and the `.launch-check/` folder in the user's project. Renaming them is open.
- **Installed locally for the desktop app:** `.claude-plugin/marketplace.json`, `claude plugin marketplace add <this folder>`, then `claude plugin install sofia@sofia-local`. After code changes: `claude plugin marketplace update sofia-local && claude plugin update sofia@sofia-local` (bump the version if the update doesn't pick it up).

## Owner decision 2026-10-19: no automatic fixing
**The flow is scan → report → discussion with Claude about what to handle → the user's go → fix,** and only what the user approved.
- **Skill:** the report asks what to go through, never "fix my N". Each item is discussed and the user picks: fix (with the exact change), intentional, not now, or not relevant. Fixing starts only on the user's go.
- **Engine:** approved fixes live in `pending.fix` in `state.json`, the same list the dashboard will use. `queue add|remove|clear|list` manages it. `fixing` refuses anything not on the list, and a verified fix leaves it.
- **Wording:** "I'll fix this" became "I can fix this".
- **Docs:** docs/04 and docs/06 carry a note that the skill references win where they differ. The M3 walkthrough shows the earlier flow.

## Decisions in M3
- A deferred or accepted blocker doesn't block "Ready" (docs/03), but the skill always says it next to the verdict.
- A key in the git history is closed by "accept" with reason "key rotated". Launch Check can't verify rotation from outside.
- Consent to side effects lasts 12 hours (a working session), not forever.

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
- **Scanning a live Vercel site trips Vercel's firewall for the scanning machine** (temporary). The probes are now minimal and run last, and the fix loop uses the local copy. Should live scans skip the probe checks unless the user asks (they'd become "local only")?
- The walkthrough was done by me (Claude) following the skill inside this session, not by a fresh Claude Code session with the plugin installed. A fresh-session run would also test the skill's triggers. It runs a separate Claude session on your account, so I'd like your OK first.
- **Hebrew dictionary licence.** The only good Hebrew dictionary (Hspell) is AGPL-3.0. Fine for development; before distributing (M8) decide between: ship it as-is (AGPL obligations may extend to the plugin), download it on first use, or drop Hebrew spell-checking.
- `--target local` (start the dev server): proposed for M2.
- From docs/07: final product name; whether `decisions` get committed by default; crawl page limit; whether quick mode runs automatically after UI edits.

## Notes from the current Claude Code docs
- Plugin skills are namespaced: the commands will show up as `/launch-check:launch-check` and `/launch-check:launch-fix`. Choose the final names in M8.
- In a skill, the engine is reached through `${CLAUDE_SKILL_DIR}/../../engine`. The docs say `${CLAUDE_PLUGIN_ROOT}` isn't substituted inside skills.
- For M6: plugins can declare **monitors** (`monitors/monitors.json`) whose output reaches the running session. That's the supported way for the page to wake Claude; the `UserPromptSubmit` hook stays as the fallback.
- `commands/` is deprecated; `/launch-check` and `/launch-fix` will be skills.
- `${CLAUDE_PLUGIN_ROOT}` = plugin install folder; `${CLAUDE_PLUGIN_DATA}` survives plugin updates (a candidate for `node_modules`).
