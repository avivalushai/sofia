---
name: launch-fix
description: Continue fixing Launch Check findings from where the last session stopped. Use when the user types /launch-fix or asks to continue or resume Launch Check fixes.
disable-model-invocation: true
---

Continue a Launch Check session from the saved state; don't re-scan.

1. Read the launch-check skill at `${CLAUDE_SKILL_DIR}/../launch-check/SKILL.md` and follow its rules and stages.
2. `node ${CLAUDE_SKILL_DIR}/../../engine/bin/launch-check.js summary --json`. If there's no scan yet, say so and offer to run one (launch-check stage 1).
3. Say in one line where things stand (`**{score} / 100.** {n} left: …`), then pick up at the first stage with work left: items being fixed (`status: fixing`) or my fixes (stage 3), then decisions (stage 4), then the user's steps (stage 5).
