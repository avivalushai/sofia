---
name: fix
description: Sofia — fix the findings the user already approved. Use when the user types /sofia:fix or asks Sofia to go ahead with the approved fixes.
disable-model-invocation: true
---

Continue a Sofia session from the saved state; don't re-scan.

1. Read the check skill at `${CLAUDE_SKILL_DIR}/../check/SKILL.md` and follow its rules and stages.
2. `node ${CLAUDE_SKILL_DIR}/../../engine/bin/launch-check.js summary --json`. If there's no scan yet, say so and offer to run one (check stage 1).
3. Say in one line where things stand and list `approved` (the fixes the user approved earlier). Typing /sofia:fix is the user's go for **that list only** → check stage 4. If nothing is approved, say so and offer to go through the open findings (stage 3) — don't fix anything that isn't approved.
