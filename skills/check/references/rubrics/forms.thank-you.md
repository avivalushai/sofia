# Rubric: forms.thank-you — Thank-you page with a next step

After someone sends a form, they should see clearly that it worked and know what happens next ("we'll reply within a day", "check your inbox", a link to keep going). A form that just empties itself, or a bare "Submitted", leaves people unsure. They send it again or give up.

Login, search and settings forms are not part of this check. Only forms that send something to the owner count (contact, sign-up, waitlist, booking, order, newsletter).

Read the files you were given. For each form like that, find what the code does after a successful submit. Name the forms in the `why` of question 1.

1. **After a successful submit, does the visitor see a clear confirmation?**
   Fail: the handler only calls `form.reset()`, clears the state, or does nothing visible. A `console.log("sent")` counts as nothing. So does an `alert()` with only "OK".
   Pass: a success message replaces the form or shows next to it, a thank-you page opens, or a toast says it was sent.
2. **Does the confirmation say what happens next or offer a next step?**
   Fail: only "Submitted" or "Thanks!".
   Pass: "Thanks, we'll get back to you within 24 hours", "Check your inbox to confirm", or a link or button to continue (read the blog, go to the dashboard, follow on Instagram).
3. **Is the confirmation shown only when the submission really succeeded?**
   Fail: the success message appears before or regardless of the server's answer (no check of `res.ok`, or no catch).
   Pass: it appears after a successful response. Failures show something else.

Findings: one for each form that fails, with file and line. Options when it fails: (1) a success message in place of the form, with what happens next (recommended); (2) a separate thank-you page with a next step; (3) a short toast plus an email confirmation.
