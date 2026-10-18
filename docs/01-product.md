# 01 — Product

## The problem

Building an app now takes a few prompts. The apps that come out are usually fine at telling their story — the problems are the dozens of things the builder never thought to check: load time, consistent design, typos, broken links, a form that silently drops leads, an API key shipped to the browser, email landing in spam.

Sometimes Claude checks these on its own. Often it doesn't, and when it does, it isn't consistent. Launch Check makes it consistent: a fixed set of checks, run the same way, reported the same way, every time.

## Who it's for

**Primary persona — "Asaf".** Builds apps with Claude Code or Cursor for personal use or for work. Not a developer. Knows what the app should do; doesn't know what "ready" means. Comfortable clicking buttons, less comfortable with jargon. Has Node and Chrome installed (assumed).

What Asaf needs:
- To be told what's wrong in words he understands
- To know what's urgent and what can wait
- To have most of it fixed for him
- Clear, step-by-step help for the parts only he can do (DNS records, rotating a key, choosing where form submissions go)

## What it is

A **Claude Code plugin** containing:
- A **skill** that runs the scan and drives the conversation
- An **engine** (Node CLI) that runs the deterministic checks
- A **local dashboard** at a fixed localhost address showing the full report, live
- A **reviewer subagent** for judgment checks, so the work isn't grading itself
- A **hook** that hands dashboard selections to Claude on the user's next message

## How it's triggered

The user asks, in their own words, while building: "scan my app", "is this ready to launch?", "what's broken here?", "check it before I deploy". The skill description must catch these. A command exists for people who prefer it:

```
/launch-check          full scan
/launch-check quick    mechanical checks only, seconds
/launch-fix            continue fixing from the current state
```

Optional, light: when Claude sees the user is about to deploy, it may offer once — "Want me to run a quick check first?" Never run a full scan unasked.

## Principles

1. **Ask one question, then work.** Before a run, the only question is what to scan (live URL or local). Everything else is decided by the skill.
2. **Detect relevance automatically.** No forms → skip form checks. No email sending → skip email checks. Say what was skipped and why, in one line.
3. **Sort by who fixes it, not only by severity.** Every finding is one of: *Claude fixes it*, *your choice*, *your action*. This is the core of the experience.
4. **Show progress.** The score rises as things get fixed. Re-runs compare to the last run.
5. **Respect "no".** When the user disagrees, offer one compromise, then accept and record the decision. Never nag.
6. **Explain consequences, not technology.**
7. **Be safe by default.** Checkpoints, per-fix commits, no side effects without consent.

## What it is not

- Not a security audit or penetration test. Security checks are a baseline.
- Not a replacement for real user testing.
- Not a CI tool (could become one later; not now).
- Not dependent on any paid service.

## Success looks like

- A first-time user goes from install to a fixed blocker in under 10 minutes.
- Two runs on the same unchanged app produce identical reports (excluding timings).
- False positives are rare enough that users don't start muting everything.
