# 03 — Check contract

## One file per check

Path mirrors the id: `engine/src/checks/resp/no-horizontal-scroll.js` for `resp.no-horizontal-scroll`.

```js
/** @type {import('../../types').Check} */
export default {
  id: "resp.no-horizontal-scroll",      // must exist in catalog/checks.json
  layer: "browser",                     // mechanical | browser | judgment
  // severity, fixer, appliesWhen, title come from the catalog; override only with a reason
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      for (const width of ctx.viewports.mobile) {          // [375, 390]
        const p = await ctx.browser.open(page.url, { width });
        const overflow = await p.evaluate(() => /* widest element vs innerWidth */ null);
        if (overflow) {
          results.push(ctx.fail({
            key: `${page.path}_${width}`,
            title: "The page scrolls sideways on mobile",
            impact: "On a phone the page drags left and right and content gets cut off",
            location: { url: page.path, viewport: width, selector: overflow.selector, file: await ctx.guessSource(overflow) },
            evidence: `${overflow.selector} is ${overflow.px}px wider than the ${width}px screen`,
            fix: "Make the element fit narrow screens, for example stack items in one column",
            shot: await p.screenshot({ highlight: overflow.selector })
          }));
        }
      }
    }
    return results.length ? results : [ctx.pass()];
  }
};
```

## The context object (`ctx`)

| Field | What it gives |
|---|---|
| `ctx.project` | root path, detected facts, package.json, file list (respecting .gitignore) |
| `ctx.target` | base URL being scanned |
| `ctx.crawl` | shared crawl result: pages, links, assets, status codes. Computed once per run |
| `ctx.browser` | `open(url, {width})` → page with `evaluate`, `screenshot`, `click`, console + network logs |
| `ctx.http` | fetch with timeout, no cookies, follows redirects with a record of each hop |
| `ctx.dns` | resolve TXT, MX, CNAME, A |
| `ctx.files` | glob + read with caching |
| `ctx.viewports` | `{ mobile: [375, 390], tablet: [768], desktop: [1280] }` |
| `ctx.consent` | `await ctx.consent.has("submit-forms")` — side-effect checks must check this |
| `ctx.pass()`, `ctx.fail({...})`, `ctx.uncertain({...})`, `ctx.skip(reason)` | result builders |
| `ctx.guessSource(el)` | best-effort map from a DOM element to a source file |

## Result schema

```json
{
  "checkId": "resp.no-horizontal-scroll",
  "status": "fail",
  "key": "/_375",
  "title": "Plain-language headline",
  "impact": "What happens to a visitor because of this",
  "location": { "url": "/", "viewport": 375, "file": "src/x.tsx", "line": 12, "selector": ".pricing" },
  "evidence": "The measurable fact the check observed",
  "fix": "What will be done (fixer=claude) or what the user must do (fixer=user)",
  "options": [ { "label": "Warm palette", "detail": "Close to the home page" } ],
  "shot": "path to screenshot or null"
}
```

- `options` is required when `fixer` is `choice` — 2 or 3 options, first one recommended.
- For `fixer: "user"`, `fix` must be concrete steps; include exact values to paste where possible (DNS records, env var names).

## Rules for writing checks

- **Deterministic.** No randomness, no time-based flakiness. Retry network once, then mark `uncertain`, never `fail`, on timeouts or bot-blocking.
- **Fast by default.** Mechanical checks in quick mode must finish in seconds total.
- **Respect `appliesWhen`.** The runner skips checks whose condition is false; a check should not re-implement that.
- **Side effects need consent.** Form submissions, emails, purchases, rate-limit probes: only when `ctx.consent.has(...)` and only against local or staging.
- **Every check has a fixture test** in `engine/test/` asserting the expected findings on `fixtures/`.
- **No jargon in `title`, `impact`, `fix`.** Technical detail goes in `evidence`.

## Judgment checks

- The engine does not run them. It emits a review task with the rubric path and the files to read.
- Rubrics live in `skills/launch-check/references/rubrics/<checkId>.md`, each a short list of yes/no questions with examples of pass and fail.
- The reviewer returns the same result schema, plus `quotes`: the file and line each conclusion relied on.

## Severity, fixer, applicability

From `catalog/checks.json`:

- `severity`: `blocker` | `important` | `polish`
- `fixer`: `claude` (fixes alone) | `choice` (Claude proposes options, user picks) | `user` (action outside the code; Claude prepares exact steps)
- `appliesWhen`: `always` or a detected fact (`forms`, `mail`, `auth`, `db`, `shop`, `ai`, `he`, `i18n`, `dark`, `ads`)
- `v1`: in the first release

## Score

- Weights: blocker 10, important 4, polish 1.
- Applicable checks only. Muted ("not relevant") checks are excluded.
- `accepted` (risk accepted) and `deferred` count as failing for the score but don't block the verdict.
- `uncertain` is excluded from the score and listed separately.
- `score = round(100 × passedWeight / totalWeight)`.
- Any open blocker caps the score at 69 and sets the verdict to **Not ready**.

Verdicts: `Not ready` (open blocker), `Almost` (score < 85), `Ready` (≥ 85, no open blockers).
