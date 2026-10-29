# 08 — Releasing

People install Sofia from this repo:

```
/plugin marketplace add avivalushai/sofia
/plugin install sofia@sofia
```

`.claude-plugin/marketplace.json` on `main` points the plugin at the **`release` branch**. That branch holds only what runs on the user's computer (skills, agents, engine, catalog, report page) plus the engine's libraries in `engine/node_modules`, so nobody has to run `npm install`. Docs, fixtures, tests and the board stay on `main`.

## To release

1. Merge the work into `main`. Tests pass (`cd engine && npm test`).
2. Raise `version` in `.claude-plugin/plugin.json` and commit. Claude Code compares this number to decide whether there's an update: without a new number, nobody gets the new code.
3. `scripts/release.sh` builds the `release` branch from `main`, installs the libraries (no browser download) and checks that the engine starts.
4. `git push origin main release`.
5. Check with `claude plugin validate .` and, from a clean Claude Code profile, install and run `/sofia:check` on a fixture.

## Updates on the user's side

Auto-update is off by default for marketplaces outside Anthropic's. Users get a new version with `/plugin marketplace update sofia`, or by turning on auto-update for the marketplace in `/plugin` → Marketplaces. Each version goes into its own folder; nothing in the plugin folder survives an update, so nothing important is stored there (results live in the user's project, `.launch-check/`).
