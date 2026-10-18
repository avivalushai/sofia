# M3 walkthrough — docs/04 stages 1–7 on a copy of the fixture

**Date:** 2026-10-18.
**Project:** `fixtures/broken-landing`, copied into a scratch folder, with git and one commit ("My pilates site").
**Target:** local. There's no live site, so `--target local` serves the folder.

**Method:** Claude followed `skills/launch-check/SKILL.md` step by step. Every engine command was really run, and every fix is a real edit to the copy with its own commit. The user's answers follow the docs/04 transcript wherever the fixture allows.

Numbers, titles and commits below are the real ones from the run. Chat lines are written as the skill would write them. Engine progress lines (`✓ …`) are shown as printed.

---

## Stage 1 — First run

> **User:** Check my app before I launch

> **Claude:**
> *↻ Looking at the project*
>
> Found: a Hebrew site and a sign-up form; no email sending, no login, no payments. I'll skip the 6 payment, 6 email and 5 login checks.
>
> What should I scan?
> - The local version — I'll start it
> - The live site — tell me the address

`detect` found no live address in the project, so only the local option is offered by name.

> **User:** The local version

> **Claude:**
> *✓ Started the app locally (served the project folder)*
> *✓ Using your installed Chrome*
> *✓ Mechanical checks · 27*
> *✓ Browser checks · 29*

## Stage 2 — Summary

> **Claude:** **52 / 100.** Not ready yet — visitors hit dead links and buttons, the page breaks on phones, and a secret key is out in the open.
>
> **Blockers**
> - A link goes to a page that doesn't exist: "אודות"
> - An image on the page doesn't load
> - The page asks for something that fails to load
> - The "לשיעור ניסיון" button does nothing
> - The page scrolls sideways on phones
> - Placeholder text is still on the page
> - A secret key is visible to anyone who opens the site
> - A secret key is saved in the project's history
> - The app calls an address that only exists on your computer
>
> **Important** · 12 · **Polish** · 1
>
> Who handles what:
> - **I'll fix these myself** · 19
> - **Need your choice** · 0
> - **Need you to do something** · 3
>
> 4 form checks are waiting for your OK to send test data.
>
> What now?
> - Fix my 19 now (recommended)
> - Go through everything by severity
> - Blockers only
> - Not now

> **User:** Fix your 19

## Stage 3 — Auto fixes

> **Claude:**
> *✓ Checkpoint saved*
> *✓ Trial-lesson button scrolls to the sign-up form*
> *✓ Pricing table stacks on mobile*
> *✓ Sign-up form calls the site's own address*
> *✓ Code error on the home page fixed*
> *✓ Sign-up details no longer printed to the console*
> *✓ 16px text in form fields*
> *✓ Buttons big enough to tap*
> *✓ Faint text darkened so it's readable*
> *✓ Email field has a label*
> *✓ Home page marked as Hebrew*
> *✓ Each page has its own title*
> *✓ Footer year updates itself*
> *✓ Friendly not-found page*
> *↻ Re-checking · 13 of 13 pass*
>
> **52 → 69.** Five of mine need something only you know. Asking those next.

There are 13 commits, one per fix, each made only after its recheck passed. The score stops at 69 because blockers are still open (docs/03).

## Stage 4 — Decisions

> **Claude:** **1 of 5.** The "אודות" (About) link goes to a page that doesn't exist. What should happen?
> - Remove the link from both pages (recommended — there's no About page in the code)
> - Create an About page
>
> **User:** Remove it
>
> **Claude:** **2 of 5.** The team photo is missing (`assets/team.jpg`). Hide the team section until you have one (recommended), or send me the photo?
>
> **User:** Hide it
>
> **Claude:** **3 of 5.** The top of the home page still has filler text. What should it say?
>
> **User:** שיעורים בקבוצות של עד שישה משתתפים, עם יחס אישי לכל אחת.
>
> **Claude:** **4 of 5.** There's no tab icon. A simple נ in the site's green (recommended), or will you send a logo?
>
> **User:** The נ
>
> **Claude:** **5 of 5.** A shared link needs a preview picture. Should I make one from the site name and colors (recommended)? And which domain will the site live on?
>
> **User:** Make one. noa-pilates.co.il
>
> **Claude:** One more: can I send test sign-ups through the form on this local copy? Nothing reaches real people.
>
> **User:** Yes
>
> **Claude:**
> *✓ Removed the link to the missing About page*
> *✓ Team section hidden until there's a photo*
> *✓ Real text in the hero*
> *✓ Tab icon: a נ in the site's green*
> *✓ Share preview for WhatsApp*
> *↻ Test sign-ups · 2 new problems: the "thank you" shows even when nothing is saved, and a double click sends twice*
> *✓ Success message only after a real save*
> *✓ Submit button waits for the answer*
>
> **69.** Three things left that only you can do.

## Stage 5 — User actions

> **Claude:**
> **☐ Turn off the leaked Stripe key** · about 5 minutes
> I removed it from the site's code. It was public, so it still works for anyone who copied it. Stripe → Developers → API keys (dashboard.stripe.com/apikeys) → Roll key.
>
> **☐ Where should sign-ups go?**
> - A Google Sheet — simplest
> - An email per sign-up
> - A database table
>
> **☐ Privacy policy** · I'll write it. Tell me what the form collects, who sees it, and an email for deletion requests.
>
> **User:** Name and email, only me, noa@noa-pilates.co.il. Sheet — but I'll connect it tomorrow. And I rolled the key.
>
> **Claude:**
> *✓ Secret key removed from the browser code*
> *✓ Privacy policy page, linked in the footer*
> *✓ Old key recorded as rotated — it stays in the code's history, so I've marked it "risk accepted: key rotated"*
> *✓ Sheet connection saved for tomorrow*

## Stage 6 — Close

> **Claude:** **94 / 100. Ready to launch** — except the sign-up form, which you're connecting to the sheet tomorrow. Until then sign-ups go nowhere.
>
> **User:** OK
>
> **Claude:** Saved. Good luck with the launch.

## Stage 7 — A week later

> **User:** I added a workshops page, check it
>
> **Claude:**
> *↻ Checking the local version again*
>
> Since last time:
> - **New:** the "הרשמה לסדנה" button on Workshops goes nowhere
> - **New:** a 538 KB image
>
> I can fix both. Go ahead?
>
> **User:** Yes
>
> **Claude:** *✓ 2 fixed and re-checked* · **94 → 97**

The two commits are `59e3be1` ("Workshop sign-up button goes to the form") and `3b65b65` ("Workshop photo: 538 KB → 140 KB").

---

## What the walkthrough found, and what changed because of it

| Found | Change |
|---|---|
| Some "I'll fix it" items need input only the user has: real text, a logo, where a link goes. | The skill fixes everything else first, then asks those questions with the Stage 4 decisions. |
| The local static server served `.git` and `.env`, which caused a false alarm. | It refuses hidden files, like real hosts do. |
| A custom `404.html` could never pass on a local scan. | The local server serves `404.html` for missing pages, like Netlify, GitHub Pages and Vercel. |
| `og:image="/assets/share.png"` passed, but WhatsApp needs the full address. | `seo.share-tags` fails relative image addresses. |
| The skill said `recheck forms behave`, but recheck took only check ids. | Recheck accepts categories. |
| A yes to test sign-ups was forgotten on the next recheck. | Consent lasts for the working session (12 hours); next week's scan asks again. |
| A skipped recheck looked like a silent failure. | Recheck reports "not re-checked" with the reason. |
| Two fixes ended up in one commit because the first left uncommitted changes. | `fixing` refuses to start while there are uncommitted changes, so each fix starts clean. |
| A deferred blocker still allowed "Ready" (docs/03) with no warning. | The close says it in the same breath: "Ready — except …". |
| A key in the git history can't be verified as rotated. | Closed with "accept: key rotated", recorded with the reason. |
| "Previous score" came from the last scan, not from just before this one. | Each run records the score at its start. |

Two mistakes in my own scripting during the walkthrough, not in the product:
- A helper command failed and left one fix uncommitted. I rewound the scratch copy and redid that fix, one commit each.
- A failed shell step skipped creating the workshops page. The engine reported the broken link to it, correctly.
