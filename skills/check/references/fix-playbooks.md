# Fix playbooks

How to fix each check, so fixes are the same every time. General rules:

- Fix the cause, once, where it's defined (a shared layout, a stylesheet, a component) — not page by page, unless the pages really are separate files.
- Smallest change that passes. Don't restyle, rename or refactor around it.
- Match the project's stack and style: Tailwind classes in a Tailwind project, CSS modules where they're used, the framework's own way (Next `metadata`, `<svelte:head>`, Vue `useHead`…).
- After each item: `recheck <checkId> --commit "<what changed>"`. It commits only when the check passes.
- The progress line says what changed for a visitor: "✓ Pricing table stacks on mobile", not "fixed resp.no-horizontal-scroll".

## Correctness

**qa.broken-links** — For each broken target: if a page with a similar name exists, point the link there; if it's unclear, ask (one question). If the page was removed on purpose, remove the link everywhere it appears (menu, footer, body) and ask whether the old address was shared — if so add a redirect (Next `redirects()`, `vercel.json` `redirects`, Netlify `_redirects`).

**qa.missing-assets** — Find where the file is referenced. If it exists under another name/path, fix the path (watch case: `Team.jpg` ≠ `team.jpg` on Linux hosts). If it doesn't exist, ask for the file, or remove the reference if it was a placeholder.

**qa.failed-requests** — Group by address. Missing files → as missing-assets. Calls to APIs that error → fix the endpoint or the URL. Calls to services that no longer exist → remove them.

**qa.console-errors** — Read the error and its source line. Typical: reading a property of something that isn't on this page (`document.querySelector(".x").classList` → guard with `?.` or only run on pages that have it), a script loaded before the element exists (move it to the end or `defer`).

**qa.dead-buttons** — Make the button do what its text says: a link to the section/page (`<a href="#contact">` styled as a button), or wire the handler. If what it should do is unclear, ask with 2–3 options (e.g. "Scroll to the sign-up form (recommended)").

**qa.custom-404** — Add a not-found page in the site's design with a link home and to the main sections: Next `app/not-found.tsx`, SvelteKit `+error.svelte`, Nuxt `error.vue`, static hosts `404.html` at the root.

**qa.error-boundary** — Next app router: `app/error.tsx` ("use client", message + "Try again" calling `reset()`) and `app/global-error.tsx`. React/Vite: wrap the app root in an error boundary (react-error-boundary if already installed, else a small class component). Friendly text, no stack traces.

**qa.loading-states** — Where the data loads, show a spinner or skeleton shapes in the same size as the content, until the data arrives.

**qa.error-states** — Where data loads, catch failures: show "Couldn't load this — try again" with a button that retries. Don't leave an empty area.

## Mobile

**resp.viewport** — `<meta name="viewport" content="width=device-width, initial-scale=1">` in the shared head (Next: the default `viewport` export is fine; don't add `maximum-scale`).

**resp.no-horizontal-scroll** — Find the element in the evidence. Fixed widths → `max-width: 100%` / `width: 100%`; flex rows → `flex-wrap: wrap` or switch to a column below ~640px; wide tables → wrap in a horizontally scrollable container; long words/URLs → `overflow-wrap: anywhere`. Never hide the overflow on `body` — that cuts content off instead of fixing it.

**resp.input-zoom** — Form fields at 16px on small screens (`font-size: 16px` for input/select/textarea, or `text-base` in Tailwind). Don't touch the viewport tag to prevent zoom.

**resp.touch-targets** — At least 44×44px: more padding (`padding: 12px 16px`) or `min-height: 44px`; space between adjacent targets.

**resp.mobile-menu** — If links disappear on phones with no button: add a menu button (accessible: `<button aria-expanded aria-controls>`) that toggles the nav. If the button doesn't open/close: fix the toggle state; close on link click and on Escape.

## Performance

**perf.images-weight** — Resize to the largest displayed size (×2 for sharp screens) and compress: convert to WebP/AVIF with `sharp` or `squoosh-cli` via npx if available; keep the original name or update references. Next projects: use `next/image`. Report "3.4 MB → 180 KB".

**perf.lcp** — Usually the hero image or a web font: compress and size the hero, give it `fetchpriority="high"` (and not `loading="lazy"`), preload the main font, defer non-essential scripts.

## Design

**design.favicon** — Add an icon from the logo (ask for it if there's none; a simple letter mark is a fallback the user must approve): `app/icon.png` in Next, `favicon.ico`/`icon.svg` + `<link rel="icon">` elsewhere. Remove the framework's default.

**design.ui-libraries** (choice) — Keep the library used in more places unless the user picks otherwise; replace each component from the other with its equivalent; remove the unused package. Commit per library swap.

**design.palette** (choice) — Merge near-duplicates into the most-used shade of each group; define them once (CSS variables or Tailwind theme) and replace the stragglers. "Show me first" → list before/after colors with where they're used.

**design.font-families** (choice) — One font for text, optionally one for headings; make form controls inherit (`button, input, select, textarea { font: inherit; }`).

**design.button-families** (choice) — Keep the most-used primary style; make a single button component/class and use it everywhere.

## Content

**content.placeholders** — Never invent copy silently. Ask for the real text, or propose a draft based on the page and ask the user to approve it.

**content.copyright-year** — Make it update itself: `{new Date().getFullYear()}` in components; in plain HTML a small script that fills a `<span>`, or a range ("2024–") only if the user prefers.

**content.spelling** — Fix the word in the source. If it's a name or brand, it isn't a typo: mute that instance with the user's OK.

**content.alt-text** (choice) — Option 1: write a short description of what each image shows (look at the image file if you can; otherwise describe from context and say so). Option 2: `alt=""` for purely decorative images.

## Accessibility

**a11y.contrast** — Darken the text (or lighten the background) to at least 4.5:1 (3:1 for large text). Pick the nearest shade that passes so the look barely changes; say the new value.

**a11y.form-labels** — A visible `<label for>` for each field (placeholders can stay as examples). If the design has no room, a visually hidden label.

**a11y.button-names** — `aria-label` on icon-only buttons and links, in the site's language ("Open menu" / "פתח תפריט").

**a11y.lang** — `lang` on `<html>` (`he` for Hebrew). In Next: the root layout's `<html lang>`.

## Hebrew

**rtl.dir** — `dir="rtl"` on `<html>` (with `lang="he"`).

**rtl.components** — Replace left/right with logical properties: `text-align: start`, `margin-inline-start`, `padding-inline-end`, `inset-inline-start`; Tailwind `ms-`/`me-`/`ps-`/`pe-`/`text-start`. Flip directional icons (arrows) in RTL.

**rtl.font** — Use a font with Hebrew letters (Heebo, Assistant, Rubik, Noto Sans Hebrew) for Hebrew text, or load the Hebrew subset of the current font.

## Search and sharing

**seo.title** — A unique title per page: "{Page} · {Site}". Next: `metadata.title` per route with a template in the root layout.

**seo.share-tags** — Title, description and a 1200×630 image (`og:title`, `og:description`, `og:image`, plus `twitter:card`). Ask for the image or make one from the logo with the user's OK.

**seo.robots** / **seo.noindex** — Remove the block for the live site; keep it only on staging if that's intended (ask if unsure).

## Security and environment

**sec.client-secrets** (user) — You do: move the code that uses the key to the server (an API route / server action / edge function) and read it from an env var without a public prefix. The user does: rotate the key in the provider's dashboard (exact place is in the finding) and set the new value in the host's env settings. Recheck after both.

**sec.repo-secrets** (user) — Rotating is the fix; rewriting history isn't needed once the key is dead. Make sure `.env*` files are in `.gitignore`.

**sec.env-files** — Deploy only the build output; for static hosts, make sure `.env` and `.git` aren't in the published folder.

**sec.debug-logs** — Remove the log, or log only non-personal context ("signup failed", status code).

**sec.open-db** (choice) — Supabase: `alter table … enable row level security;` plus policies per the user's choice (own rows: `auth.uid() = user_id`). Firebase: rules requiring `request.auth != null` and ownership. Show the user the rules before deploying them.

**sec.exposed-paths** (choice) — Require login (middleware/route guard) or remove the page.

**env.localhost-urls** — Relative paths (`/api/...`) for same-site APIs; otherwise an env var with the live address and no localhost fallback in production.

**env.missing-vars** (user) — Add the name to `.env.example`; give the user the exact place to set it on their host.

**launch.staging-urls** — Replace with the live address or a relative path.

**launch.https-redirect** / **launch.ssl-valid** (user) — Host settings; give the exact clicks for their host (ask which one if unknown).

**mail.auth** (user) — Ask who the domain provider is, then give exact clicks and the records from the finding in a code block. Recheck on "done".

## Forms (after consent)

**forms.destination** (user) — Ask where submissions should go (Google Sheet — simplest / email per sign-up / database). Connect it; then a test submission with consent.

**forms.success-truth** — Show success only after the save succeeds; on failure show an error and keep the typed values.

**forms.validation** — `required`, `type="email"`, and a visible message next to each invalid field.

**behave.double-submit** — Disable the submit button and show "Sending…" from the first click until the response; re-enable on error.

## Privacy and data

**privacy.policy** (user) — Collect what's collected, who sees it, business name and contact email; draft the page; link it in the footer; the user must read and approve it.

**privacy.cookie-blocks** — Load analytics only after Accept; add a "No thanks" button that's as easy to click as Accept.

**data.local-only** (choice) — Option 1: a database (Supabase free tier) and move saving there. Option 2: keep on-device, add a clear note and an export button.
