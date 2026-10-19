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
| 7 spelling mistakes | 6 false, **1 real** (`שלחח` in the share button) | Hebrew prefixes, spelling with or without ו/י, and forms of the game's own word "נהוראי" |
| `ADMIN_TOKEN` missing | false (too strong) | set in Vercel's dashboard, as the project's own docs say |
| No privacy policy | real | |

### After the fixes, local copy: 3 findings, all real

| Finding | Status |
|---|---|
| No custom not-found page | real |
| `שלחח` → `שלח` | real |
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
