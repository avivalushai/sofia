# Rubric: analytics.conversions — The site's main action is measured

Page views alone don't tell you whether the site works. What matters is how many visitors do the one thing the site is for: sign up, book, buy or send the form. Without an event for that action you can't tell which page, ad or change brings results.

You were given the pages' text, the code with forms and main buttons, and the analytics code.

First name the site's main action (or two) in the `why` of question 1. For example "book a trial class", "sign up", "buy" or "send the contact form".

1. **Is an analytics event sent when the main action succeeds?**
   Fail: analytics is installed but nothing is sent on sign-up, purchase or form success (only page views); or no analytics at all. In that case quote the success handler.
   Pass: `gtag("event", "sign_up")`, `posthog.capture("booked")`, `plausible("Signup")`, a GA4 key event on the thank-you page, or similar.
2. **Is it sent on success, not on the click?**
   Fail: the event fires when the button is pressed, before the server says it worked, so failed attempts are counted.
   Pass: it fires after a successful response, or on the success page.
3. **For paid actions, is the value sent?**
   Fail: a purchase event without the amount and currency. Answer `pass` with "Doesn't apply:" when nothing is paid.
   Pass: value and currency are included.

Findings: one for each missing or misplaced event, quoting the line where it should be sent. Options: (1) add the event after success, and I'll write it (recommended); (2) count it from the thank-you page instead; (3) skip it for now.
