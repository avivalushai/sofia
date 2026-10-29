# Rubric: leftover.unwired-ui — UI that looks wired but isn't

Generated UIs often have buttons, forms and toggles that look finished but do nothing real: an empty handler, a `console.log`, a TODO, a toggle that resets on refresh.

Read the files you were given. Answer each question.

1. **Is there a button or link whose handler is empty, only logs, only shows an alert, or is a TODO?**
   Fail: `onClick={() => {}}`, `onClick={() => console.log("clicked")}`, `// TODO: implement`, `alert("Coming soon")` on a main action.
   Pass: the handler navigates, calls an API, changes state that matters, or the control is visibly disabled with an explanation.
2. **Does a form "submit" without sending or saving the data anywhere?**
   Fail: `handleSubmit = (e) => { e.preventDefault(); setSent(true) }` with no request or storage.
   Pass: the data is sent to an API, a service or saved.
3. **Are there settings, toggles or preferences that aren't saved?**
   Fail: a "Dark mode" or "Email notifications" switch that only sets local component state, so it resets on reload.
   Pass: saved (database, API, or browser storage when that's clearly enough).
4. **Are there features that pretend to work with fake delays or fixed results?**
   Fail: `await sleep(1000); return { success: true }` in place of a real call; search that always returns the same list.
   Pass: none.

A handler that exists in a demo or example page that isn't linked from the app doesn't count. If you can't find where a handler leads, say uncertain and why.

Findings — one per control or feature, with file and line. Fix: what it should do, in plain words ("send the message to your email", "save the setting to the account").
