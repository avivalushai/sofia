# Rubric: content.error-copy — Unhelpful error messages

When something goes wrong, the message is often the only help a person gets. "Error", "Something went wrong", "Error 500" or a raw technical message leaves them stuck. They don't know whether to try again, fix what they typed, or give up. Many give up.

Read the files you were given. Find every message shown to a visitor when something fails: form errors, failed requests, failed sign-in, empty results caused by errors, and toast or alert messages.

1. **Does each error message say what happened, in plain words?**
   Fail: "Error", "Error 500", "Request failed", "שגיאה", "משהו השתבש", a status code alone, or a raw `err.message` or stack shown to the visitor.
   Pass: "We couldn't send your message", "That email is already registered", "השמירה נכשלה".
2. **Does it tell the person what to do next?**
   Fail: no next step, for example "Something went wrong." and nothing more.
   Pass: "Check your connection and try again", "Try a different email or log in", a retry button, or a contact address.
3. **Is the error shown at all, rather than swallowed — including when the connection drops?**
   Fail: `catch (e) { console.log(e) }` with nothing shown to the visitor; or a request (`fetch`, `axios`) with no `catch` around it at all, so a dropped connection throws and the page stays unchanged, even if a bad status code is handled.
   Pass: the visitor sees a message both when the server answers with an error and when the request can't be sent (a `catch`, a `try`, or an error boundary that shows something).

Findings: one for each message or each place that fails, with file and line. Options: (1) rewrite the message to say what happened and what to do, with a suggested text (recommended); (2) add a retry button or a contact link next to it; (3) keep it as it is.
