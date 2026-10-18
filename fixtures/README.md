# Fixtures

`broken-landing/` is a small Hebrew landing page with seeded problems. It's the first test target for every check.

- Serve it with any static server on a local port (the engine's test harness should do this itself).
- `expected.json` lists the result each implemented check must produce. Add rows as checks are implemented; never loosen a row to make a test pass.
- All secrets in it are fake.

Add more fixtures as the catalog grows. Suggested next ones:
- `clean-landing/` — the same site with everything fixed; every v1 check must pass. This is the main guard against false positives.
- `app-with-auth/` — a tiny app with login and two users, for `sec.idor`, `sec.server-authz`, `data.local-only`.
- `ai-app/` — calls a mock model endpoint, for the `ai.*` and `cost.*` checks.
