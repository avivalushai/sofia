# M4 false-positive pass: real apps

**Date:** 2026-10-19.
**Method:**
- Each project was copied into a scratch folder, without `node_modules`. The originals weren't touched.
- The live sites were scanned in full mode, read-only: no forms sent, nothing fixed.
- Every finding was checked against the source and marked real or false.
- Each false alarm was fixed in the engine and covered by a test (`engine/test/realworld.test.js`).

## NehoRace — https://nehorace.vercel.app
Plain ES modules, canvas, Hebrew, Vercel functions in `api/`.

### First scan, live: 13 findings

| Finding | Verdict | Cause |
|---|---|---|
| Script, stylesheet and icon don't load (403) | false | Vercel's bot protection ("Security Checkpoint") answered instead of the site |
| A bare not-found page | false | same: it was the challenge page |
| 7 spelling mistakes | 6 false; `שלחח` is intentional slang (the owner confirmed), so also false | Hebrew prefixes, spelling with or without ו/י, forms of the game's own word "נהוראי", and slang. A checker can't know what's intentional. |
| `ADMIN_TOKEN` missing | false (too strong) | set in Vercel's dashboard, as the project's own docs say |
| No privacy policy | real | |

### After the fixes, local copy: 3 findings, 2 real

| Finding | Status |
|---|---|
| No custom not-found page | real |
| `שלחח` → `שלח` | intentional slang: the owner would mark it "intentional" |
| No privacy policy | real |

Plus 5 "couldn't tell" items, each with its reason:
- `/api/*` only runs on Vercel.
- The local multiplayer server (`localhost:8788`) isn't running in a local scan.
- `ADMIN_TOKEN` can't be seen from the project.

## Blockout — https://useblockout.vercel.app (`~/Projects/ComponentLab`)
Vite, React, seven component libraries on purpose, Amplitude.

| Finding | Verdict | Cause / fix |
|---|---|---|
| Faint text (#a1a1aa on white, 2.56) | real | |
| "Open the editor anyway" is 34px tall on phones | real | |
| No custom not-found page | real | Vercel's default 404 |
| No privacy policy | real | the more so with Amplitude |
| 9 slightly different grays | false | Tailwind's zinc scale. A full scale from one family now counts as a design system. |
| `http://localhost/` in the bundle | false | a library's base for parsing addresses. A bare `http://localhost` with no port or path is now ignored. |
| 6 component libraries mixed | right, but intended | Blockout's product shows one design in many libraries. The finding now offers "They're there on purpose", and the title gives the count. |
| `sec.exposed-paths` | couldn't tell | Vercel started blocking during the probes (see below) |
| **Missed:** Amplitude starts before cookie consent | **false negative** | `src/main.tsx` initializes Amplitude on load. The check now knows Amplitude's endpoints and its `AMP_` cookie. Re-scan pending, see below. |

## The biggest finding: scanning a Vercel site gets the scanner blocked
After one scan, Vercel's firewall challenged every request from this machine, even a plain curl to the home page. The trigger was the probe requests (`/.env`, `/.git/config`, `/wp-admin/`, `/phpinfo.php`…): to a host's firewall they look like an attack scan. Changes:
- **Fewer probes:** `/.env`, `/.git/HEAD`, `/admin`, `/dashboard`, plus routes that exist in the project's code. They're spaced out and run last.
- **Bot protection is recognized:** Vercel and Cloudflare headers, and challenge pages. Anything a check saw through it becomes "couldn't tell", never "fail". A challenged home page stops the scan with a plain message. Launch Check never tries to get past a challenge.
- **A blocked sub-request** (an API call, an image) affects only checks about requests. Contrast, layout and fonts still answer.
- **The skill prefers the local copy for the fix loop,** so rechecks don't hit the firewall.

## Still to do
- **Re-scan both live sites** once Vercel stops challenging this machine. This confirms the Amplitude detection, the zinc-scale rule and the localhost rule on the real pages.
- **A third app with a form, login or database,** or the `app-with-auth` fixture.

## Lesson: spelling and wording are the owner's call
`שלחח` was flagged and I labeled it a real typo without asking. It's intentional slang. A checker can only say "this looks unusual". Whether it's a mistake is the owner's decision. Proposed (awaiting the owner's OK): spelling and placeholder findings move from "I'll fix this" to "Your choice", one word at a time, with "it's intentional" as an option that mutes that word.

## M9 checks on the same apps (2026-10-29)
Local copies (scratch folder, originals untouched), the 22 checks added so far in M9: security, forms, data, mobile.

**NehoRace:** no false alarms.
- No forms and no login, so the form and login checks skip.
- `sec.headers` says "couldn't tell" on the local copy, because there's no host settings file.
- The code reviewer read 13 files for `sec.xss-output` and found no problem. Player names are shown as plain text (`textContent`), and the address bar is only used to look up rooms. Its quotes checked out against the code.

**Blockout:** 4 false alarms, all fixed and covered in `engine/test/realworld.test.js`.

| Finding | Cause | Fix |
|---|---|---|
| 23 forms "with no spam protection", 10 "without Enter-key hints" | Editor panels and component demos were counted as forms | These checks now count only forms whose content goes somewhere: a form address, a POST, a database write, a form service or a sign-in |
| 2 password fields "without autofill" | Demo fields, one of them read-only | Read-only and disabled fields are skipped, and only forms that send something count |
| "Form submissions only exist as an email" | The word "Resend" in a template sentence | A mail service now has to be imported, or called by its address |
| Buttons "overlapping" on tablets | Items scrolled out of view inside a side panel, under the welcome dialog | An overlap counts only where one of the two buttons is really visible at that spot |

### Content and design (same day)
- **NehoRace:**
  - The design checks all pass. There's no dark mode and no not-found page, so those two skip.
  - The `content.button-labels` reviewer passed every question.
  - The `content.error-copy` reviewer found 5 real places where a failure is silent or unhelpful. For example, a race that doesn't reach the champions board because the connection dropped, and an invite link that opens to nothing. Each comes with a "Keep it as it is" option, since the game is designed to work offline.
- **Blockout:**
  - Type sizes 1px apart (11/12/13/14), odd spacing values, and 7 corner roundings are true observations about a dense editor UI. They're polish-level "choice" findings that the owner can keep.
  - The 5 icon sets come from the component libraries the product shows on purpose. The finding offers "They're there on purpose", as `design.ui-libraries` does.
- **Rubric fix:** two reviewers disagreed on whether a request with no `catch` counts as "error swallowed". The rubric now says it does. Two fresh reviewers then matched on every question.

### Sharing, search and AI agents (same day)
No false alarms.
- **NehoRace:** no `<main>`, no structured data, no llms.txt and no robots.txt. All true.
- **Blockout:** its single-page app sends an empty page (0 words as sent, 240 after scripts). Its description is 195 characters, it has no `<h1>`, and /llms.txt answers with the app's home page. All true. The pre-rendering finding offers "Keep it as it is".

### Every check, on both apps (end of M9)
Local copies. These are the categories not run on the real apps before: accessibility, Hebrew, quality, performance, email, shop, launch, operations, privacy, analytics, AI, cost, libraries, leftovers and behaviour.

**True findings, for example:**
- NehoRace: zoom is blocked (`user-scalable=no`); there's no accessibility statement, privacy policy or terms; the name field shows no keyboard focus; `tools/catalog.html` and `tools/images.html` are public but not linked.
- Blockout: 6 pieces of text are too faint; Amplitude runs before consent; a wrong address returns the home page with 200.

**5 false alarms, fixed and covered in `engine/test/realworld.test.js`:**

| Finding | Cause | Fix |
|---|---|---|
| NehoRace: "your own visits are counted" | It marks test traffic by hostname and `navigator.webdriver` (`is_test`), a form the check didn't recognise | Hostname-based checks, `is_test` and `navigator.webdriver` now count |
| NehoRace: "text hidden until the Google font arrives" | The `preconnect` hint to fonts.googleapis.com was read as the stylesheet | Only stylesheet links count |
| NehoRace: "live/room.js isn't used" | `live/` is a separate server with its own package.json | Folders with their own package.json are left out |
| Blockout: 4 speed checks crashed, and "blank on a slow connection" | The local copy runs on Vite's dev server, which sends hundreds of unbundled files | Speed and slow-network checks skip on a local dev server, with the reason given |
| Blockout: "vite has a known security hole" | Vite is a dev tool (devDependency) and never reaches visitors | Only `dependencies` are looked up |
