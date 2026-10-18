# 05 — Dashboard UI

The local page opened at the start of a run. It holds everything the chat shouldn't: the full list, screenshots, filters, history.

English UI, left-to-right. The **scanned app's** content may be Hebrew or any language — render quoted text with `dir="auto"` so it displays correctly.

## Job of the page

1. Show where the app stands at a glance
2. Let the user understand any finding fully without asking Claude
3. Let the user choose what to fix, mute, accept or defer
4. Show progress live while Claude works

## Layout

### Header
- Project name, target scanned, run time, mode
- **Score dial** with verdict (Not ready / Almost / Ready), colored by verdict
- Live status pill: `Scanning… 41/84`, `Claude is fixing 3 items`, `Idle`

### Tally strip
Blockers · Important · Polish · Passed · Skipped — each clickable as a filter.

### Fixer actions (the main controls)
Three cards in a row:
- **Claude fixes · 5** — "Queue all" button (primary)
- **Your choice · 2** — "Review" opens the first decision
- **Your action · 2** — "See steps" opens a checklist

### Since last run
`58 → 71 · 4 fixed · 1 new`, expandable list. On first run: "First run — next time you'll see what changed".

### Findings list
- Group by: **severity** (default) / fixer / category
- Filters: category, layer, fixer, status, search
- Each row: severity stripe, title, one-line impact, fixer chip, layer chip, status, checkbox for queueing
- Click opens the detail drawer

### Detail drawer
- Title, impact
- Where: URL, viewport, file and line (file paths in monospace)
- What was found (evidence)
- How it gets fixed
- **Before / after screenshots** side by side; slider to compare when both exist
- For `choice`: the options, as selectable cards
- For `user`: numbered steps with copy buttons for exact values
- Actions: **Queue fix** · **Mute** (with scope: this instance / this check / this category, and a reason field) · **Accept risk** · **Defer**
- Check id at the bottom, small

### Muted & skipped
Separate tab. Each with reason and an **Unmute** button. Skipped-by-detection items show why ("no payment provider found").

### Checks catalog
Read-only list of every check, so curious users can see what's covered.

## The pending bar

When the user queues anything, a bar sticks to the bottom:

> **5 items queued.** Go back to Claude and type **go**. &nbsp; [Copy "go"] [Clear]

It stays until the skill clears `pending` in the state. When Claude picks them up, the bar changes to "Claude is working on 5 items" and rows update live.

## Live behaviour

- Subscribes to `/api/events` (SSE). Re-renders on every state change.
- Rows animate status changes subtly: open → fixing → fixed (green check).
- Score dial animates to the new value.
- If the server goes away: a quiet banner "Report server stopped — run /launch-check to reopen". The page still shows the last state.
- A new run while the page is open: toast "New run started", list refreshes in place. Never open a second tab.

## Export
"Export report" → single static HTML file with screenshots embedded, for sharing.

## Visual direction

- Calm, utilitarian, information-dense. This is a working tool, not a landing page.
- Light and dark themes, following the OS.
- Semantic colors for severity (red / amber / gray) and verdict (green when ready), separate from the accent color.
- Fixer chips must be distinguishable without color: solid (Claude), outlined (choice), dashed (user).
- Tabular numbers, monospace for paths and ids.
- Works at laptop width first; usable at tablet width.

## Tech

- Static, prebuilt into `ui/dist`. No install-time build.
- Small framework or vanilla — your call. Keep the bundle small; it's served locally but should still open instantly.
- No external network requests from the page (fonts included locally or system fonts).
