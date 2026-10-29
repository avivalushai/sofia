# Launch Check — build brief

Unzip this into the root of a new, empty Claude Code project, then tell Claude:

> Read CLAUDE.md and the docs it points to, then start milestone M0.

## What's inside

```
CLAUDE.md                       project instructions Claude Code loads automatically
docs/
  01-product.md                 who it's for, principles
  02-architecture.md            plugin layout, engine, state, dashboard server, hook
  03-check-contract.md          how a check is written, result schema, score
  04-conversation-flow.md       the chat experience, as transcripts
  05-dashboard-ui.md            the local report page
  06-report-format.md           wording rules and templates
  07-milestones.md              build order and acceptance criteria
catalog/
  checks.json                   175 checks — the source of truth
  checks.csv                    same, for spreadsheets
  build_catalog.py              regenerates both files
fixtures/
  broken-landing/               a site with seeded problems
  broken-landing/expected.json  what each check must find
```

To change the catalog, edit `catalog/build_catalog.py` and run `python3 catalog/build_catalog.py`.
