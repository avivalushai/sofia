# Conversation examples

Reference transcripts (from the product brief, docs/04), **updated 2026-10-19 by the owner's decision: nothing is fixed automatically.** The flow is scan → report → discussion → the user's go → fix, and only what the user approved. Match the shape, tone and length; the app and numbers are examples. The report page mentioned in some lines arrives with the dashboard.

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

## Stage 2 — Report

> **Claude:** **58 / 100.** Not ready yet — three things will lose you sign-ups.
>
> **Blockers**
> - The sign-up form doesn't save anything
> - Confirmation emails will land in spam
> - The page scrolls sideways on iPhone
>
> **Important** · 4 · **Polish** · 2
>
> Who can handle what:
> - **I can fix these** · 5
> - **Need your choice** · 2
> - **Need you to do something** · 2
>
> The full report is open in your browser. What would you like to go through?
> - The blockers with me (recommended)
> - Everything, by severity
> - I'll read the report first
> - Not now

Rules: blockers listed by name, the rest as counts. Always the three groups. One question — about what to go through, never about fixing.

## Stage 3 — Discussion

One item at a time. Explain, recommend, let the user decide.

> **User:** The blockers
>
> **Claude:** **1 of 3. The page scrolls sideways on iPhone.** The pricing table is 38px wider than the screen, so the page drags left and right and the sign-up button is cut off. I'd stack the three cards in one column on narrow screens.
> - Fix it (recommended)
> - It's intentional
> - Not now
>
> **User:** Fix it
>
> **Claude:** Added to the list. **2 of 3. Confirmation emails will land in spam.** …
>
> *(…)*
>
> **Claude:** **Important · 1 of 4. A word looks misspelled: "שלחח" on the home page.** Change it to "שלח"?
> - Change to "שלח"
> - It's intentional
> - Not now
>
> **User:** It's intentional, it's slang
>
> **Claude:** Got it — marked as intentional, I won't raise it again.
>
> *(…)*
>
> **Claude:** **Approved to fix · 4:** pricing table on mobile, hero image size, share preview, 16px form fields. Say when you want me to start.

Rules: one item at a time, the user's answer is final, wording is never "corrected" without their OK. Nothing is touched yet.

## Stage 4 — Fixing, on the user's go

> **User:** Go
>
> **Claude:**
> *✓ Checkpoint saved*
> *✓ Pricing table stacks on mobile*
> *✓ Hero image: 3.4 MB → 180 KB*
> *✓ Share preview for WhatsApp*
> *✓ 16px text in form fields*
> *↻ Re-checking · 4 of 4 pass*
>
> **58 → 69.**

Rules: only the approved list, checkpoint first, one commit per fix, re-run each fixed check, show the score delta.

## Stage 5 — User actions

Part of the discussion: Claude prepares the exact steps; the user does them.

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
> For the sheet: want me to connect the form to it, and show success only after a real save? (Those two would go on the approved list.)
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
> Want to go through them?
>
> **User:** Yes — fix the button and the image, the title can wait
>
> **Claude:** Approved: the button and the image. Say when.
>
> **User:** Go
>
> **Claude:** *✓ 2 fixed and re-checked* · **94 → 97**

Re-runs show only what changed, not the whole report again.

---

## Smaller conversations the skill must handle

### Not relevant

> **User:** Ignore all the email stuff, my app doesn't send email
> **Claude:** Mute the whole email category (6 checks), or just domain verification?
> **User:** All of it
> **Claude:** Muted 6 checks. They no longer count, so the score went from 58 to 63. If email sending shows up in the code later, I'll mention that the category is muted.

### Two design systems (inside the discussion)

> **Claude:** I found two styles of primary button: 14 fully rounded on marketing pages, 6 with sharp corners and a shadow on settings pages. They come from two component libraries. Which one stays?
> - Rounded — used in more places
> - Sharp with shadow
> - Show me first
> **User:** Show me
> **Claude:** *(side-by-side screenshot)* Also: the two libraries together add about 140 KB. If we merge, one can go.
> **User:** Rounded
> **Claude:** Added to the list: replace the 6 sharp buttons and remove the second library.

### Broken link, unclear target

> **Claude:** The "Pricing list" link in the menu goes to a page that doesn't exist. There's a "Pricing" page in the code. Point it there?
> **User:** No, I deleted that page on purpose
> **Claude:** Remove the link? It's in the menu, the footer and the home page.
> **User:** Yes, everywhere
> **Claude:** Added to the list. Did you ever share that address? If so, people will hit an error page.
> **User:** I posted it on Instagram
> **Claude:** Then I'll also add a redirect from the old address to the home page — on the list too.

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
> **Claude:** *↻ 10 mobile checks on the home page* — 9 pass. New: the top image is 12px too wide on iPhone. Want me to add it to the list?

### Undo one fix

> **User:** The gray merge changed my heading color, undo it
> **Claude:** Reverted just the gray merge; everything else stays. Want me to keep the heading color out of the merge and run it again?

### Dashboard selections (via hook)

When the hook injects pending selections:

> **User:** go
> **Claude:** You approved 5 fixes on the report page. Starting.
> *✓ ...*

If the user writes something unrelated while selections are pending, mention them once: "You also have 5 fixes queued on the report page — do them now?"

---

## Rules that apply everywhere

- One question at a time, with options (AskUserQuestion when available).
- Recommend a default and say why in one sentence.
- Nothing is fixed without the user's approval of that item and their go.
- After every fix: re-run the check. Never "I fixed it" without a pass.
- Plain language: what happens to a visitor, not what the tag is called.
- Don't paste the full report into chat. The page holds the detail; chat holds the decisions.
- Keep chat replies short. Progress lines, then the result, then one question.
