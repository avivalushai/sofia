# 04 — Conversation flow

This is the experience in chat. The SKILL.md must produce it. Transcripts below are the reference; match their shape, tone and length.

Formatting in transcripts: lines in *italics* starting with ✓ or ↻ are progress lines Claude prints while working.

## Stage 0 — Install

User pastes one line they found online:

> **User:** Install the Launch Check plugin from github.com/<owner>/launch-check

> **Claude:** *✓ Installed.* To run it, say "check my app", or type `/launch-check`.

## Stage 1 — First run

> **User:** Check my app before I launch

> **Claude:**
> *↻ Looking at the project*
>
> Found: a Hebrew site, a sign-up form, email sending, no payments. I'll skip the 6 payment checks.
>
> What should I scan?
> - The live site — noa-pilates.vercel.app
> - The local version — I'll start it

Use the AskUserQuestion tool for this. It is the **only** question before the scan.

> **User:** The live site

> **Claude:**
> *✓ Using your installed Chrome*
> *✓ Mechanical checks · 31*
> *✓ Browser checks · 47*
> *✓ Judgment checks · 6*
> *✓ Report open at localhost:4319*

## Stage 2 — Summary

> **Claude:** **58 / 100.** Not ready yet — three things will lose you sign-ups.
>
> **Blockers**
> - The sign-up form doesn't save anything
> - Confirmation emails will land in spam
> - The page scrolls sideways on iPhone
>
> **Important** · 4 · **Polish** · 2
>
> Who handles what:
> - **I'll fix these myself** · 5
> - **Need your choice** · 2
> - **Need you to do something** · 2
>
> The full report is open in your browser. What now?
> - Fix my 5 now (recommended)
> - Go through everything by severity
> - Blockers only
> - Not now

Rules: blockers listed by name, the rest as counts. Always the three fixer buckets. One question with options.

## Stage 3 — Auto fixes

> **User:** Fix your 5

> **Claude:**
> *✓ Checkpoint saved*
> *✓ Pricing table stacks on mobile*
> *✓ Hero image: 3.4 MB → 180 KB*
> *✓ Share preview for WhatsApp*
> *✓ 16px text in form fields*
> *✓ Footer year updates itself*
> *↻ Re-checking · 5 of 5 pass*
>
> **58 → 71.** Two decisions next.

Rules: checkpoint first, one commit per fix, re-run each fixed check, show the score delta.

## Stage 4 — Decisions

One question per decision, numbered "1 of 2". Recommended option first.

> **Claude:** **1 of 2.** The cookie banner only lets people accept. Which do you prefer?
> - Add a "No thanks" button (recommended)
> - Remove the analytics tool and the banner
>
> **User:** Add the button
>
> **Claude:** **2 of 2.** There are 9 shades of gray. Merge them into 3:
> - Warm, close to the home page
> - Cool, close to the pricing page
> - Show me first
>
> **User:** Warm
>
> **Claude:**
> *✓ Reject button added, analytics loads only after consent*
> *✓ 9 grays → 3*
>
> **71 → 78.** Two things left that only you can do.

## Stage 5 — User actions

Claude prepares everything and keeps working in parallel.

> **Claude:**
> **☐ Verify your domain for email** · about 5 minutes
> Who is your domain provider? I'll tell you exactly where to click.
>
> **☐ Where should sign-ups go?**
> - A Google Sheet — simplest
> - An email per sign-up
> - A database table
>
> **User:** Domain is with Namecheap, and a Google Sheet
>
> **Claude:** In Namecheap: Domain List → Manage → Advanced DNS. Add these three records:
> ```
> TXT    @                   v=spf1 include:_spf.resend.com ~all
> TXT    _dmarc              v=DMARC1; p=none
> CNAME  resend._domainkey   resend._domainkey.example.cdn
> ```
> Meanwhile I'm connecting the form to the sheet.
> *✓ Form connected to the sheet*
> *✓ Success message only after a real save*
>
> Type "done" when the records are in.

## Stage 6 — Close

> **User:** Done
>
> **Claude:**
> *✓ Email records verified*
> *↻ Test sign-up · reached the sheet, confirmation landed in the inbox*
> *✓ Test row removed from the sheet*
>
> **94 / 100. Ready to launch.**
>
> One polish item left: every page has the same title. Fix now or next run?
>
> **User:** Next run
>
> **Claude:** Saved. Good luck with the launch.

The test sign-up is a side-effect action. It happens only because the user connected the destination themselves in this session; otherwise ask first.

## Stage 7 — A week later

> **User:** I added a workshops page, check it
>
> **Claude:**
> *↻ Quick check · new and changed pages*
>
> Since last time:
> - **New:** the "Sign up" button on Workshops goes nowhere
> - **New:** a 2.1 MB image
> - **Still open:** same title on every page
>
> I can fix all three. Go ahead?
>
> **User:** Yes
>
> **Claude:** *✓ 3 fixed and re-checked* · **94 → 98**

Re-runs show only what changed, not the whole report again.

---

## Smaller conversations the skill must handle

### Not relevant

> **User:** Ignore all the email stuff, my app doesn't send email
> **Claude:** Mute the whole email category (6 checks), or just domain verification?
> **User:** All of it
> **Claude:** Muted 6 checks. They no longer count, so the score went from 58 to 63. If email sending shows up in the code later, I'll mention that the category is muted.

### Two design systems

> **Claude:** I found two styles of primary button: 14 fully rounded on marketing pages, 6 with sharp corners and a shadow on settings pages. They come from two component libraries. Which one stays?
> - Rounded — used in more places
> - Sharp with shadow
> - Show me first
> **User:** Show me
> **Claude:** *(side-by-side screenshot)* Also: the two libraries together add about 140 KB. If we merge, one can go.
> **User:** Rounded
> **Claude:** *✓ 6 buttons replaced* *✓ Second library removed* *✓ Re-check: one button family*

### Broken link, unclear target

> **Claude:** The "Pricing list" link in the menu goes to a page that doesn't exist. There's a "Pricing" page in the code. Point it there?
> **User:** No, I deleted that page on purpose
> **Claude:** Remove the link? It's in the menu, the footer and the home page.
> **User:** Yes, everywhere
> **Claude:** Removed from all three. Did you ever share that address? If so, people will hit an error page.
> **User:** I posted it on Instagram
> **Claude:** Added a redirect from the old address to the home page.

### User disagrees

> **Claude:** The gray text under the headings has low contrast — 3.1, the minimum is 4.5.
> **User:** That's on purpose, I want it subtle
> **Claude:** A gray two steps darker passes and still looks subtle. Want to see it?
> **User:** No, leave it
> **Claude:** Marked as "risk accepted". It won't block the launch, but it stays in the report in gray.

One compromise, then accept. Never raise it again in the same session.

### Why does this matter

> **User:** What are these email records and why should I care
> **Claude:** When your site sends email in your name, Gmail checks whether your domain allowed that server to send. Without the records the answer is "unknown", and the email goes to spam. The person who signed up never gets a confirmation and assumes it didn't work.

### Focused re-check

> **User:** I changed the home page, just check mobile
> **Claude:** *↻ 10 mobile checks on the home page* — 9 pass. New: the top image is 12px too wide on iPhone. Fix it?

### Undo one fix

> **User:** The gray merge changed my heading color, undo it
> **Claude:** Reverted just the gray merge; everything else stays. Want me to keep the heading color out of the merge and run it again?

### Dashboard selections (via hook)

When the hook injects pending selections:

> **User:** go
> **Claude:** You picked 5 fixes on the report page. Starting.
> *✓ ...*

If the user writes something unrelated while selections are pending, mention them once: "You also have 5 fixes queued on the report page — do them now?"

---

## Rules that apply everywhere

- One question at a time, with options (AskUserQuestion when available).
- Recommend a default and say why in one sentence.
- After every fix: re-run the check. Never "I fixed it" without a pass.
- Plain language: what happens to a visitor, not what the tag is called.
- Don't paste the full report into chat. The page holds the detail; chat holds the decisions.
- Keep chat replies short. Progress lines, then the result, then one question.
