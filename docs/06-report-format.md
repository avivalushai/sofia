# 06 — Report format

> **Updated 2026-10-19 (owner decision):** nothing is fixed automatically. The flow is scan → report → discussion → the user's go → fix, and only what the user approved. The working version is `skills/launch-check/references/report-format.md`; where this file differs, that one wins.

## Saved files

```
.launch-check/state.json        source of truth
.launch-check/report.md         human-readable report, regenerated after every change
.launch-check/shots/            screenshots
.launch-check/server.json       dashboard port and pid
```

Add `.launch-check/` to `.gitignore` on first run, except `decisions` — offer to commit decisions so they're shared across machines. (Simplest: keep decisions inside state.json and ask once whether to commit it.)

## A finding, everywhere it appears

Always the same six parts, in this order:

| Part | Rule | Example |
|---|---|---|
| Title | Plain words, what's wrong | Your secret key is visible in the browser |
| Impact | What happens to a visitor or to the owner | Anyone can copy it and run requests on your account |
| Where | URL + viewport, or file + line | `src/lib/ai.ts` line 4 |
| Found | The measurable fact | A string matching a secret-key pattern is in the client bundle |
| Fix | What will be done, or exact steps for the user | Move the call to the server, store the key in env vars, then rotate the old key — it's already exposed |
| Check id | Small, last | `sec.client-secrets` |

## Severity wording

- **Blocker** — "will lose you users, money or data"
- **Important** — "visitors will notice"
- **Polish** — "makes it look finished"

## Fixer wording

- **I'll fix this** (Claude)
- **Your choice** (choice)
- **Your action** (user)

## Writing style

- Consequence first: "A link shared on WhatsApp will look empty", not "Missing og:image".
- No acronyms in title or impact. SPF/DKIM/DMARC are "email records"; LCP is "time until the main content shows"; CLS is "content jumping while loading".
- Numbers with units people understand: seconds, MB, pixels.
- Never blame the user. Never "you forgot".
- No exclamation marks, no emoji in findings.

## Chat summary template

```
**{score} / 100.** {verdict sentence}

**Blockers**
- {title}
- {title}

**Important** · {n} · **Polish** · {n}

Who handles what:
- **I'll fix these myself** · {n}
- **Need your choice** · {n}
- **Need you to do something** · {n}

{one question with options}
```

## report.md

Same content as the dashboard: header, score, tally, since-last-run, then findings grouped by severity, each with the six parts. Muted and accepted at the end. Used when the dashboard isn't open and as the export fallback.
