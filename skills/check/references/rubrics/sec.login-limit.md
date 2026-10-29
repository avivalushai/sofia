# Rubric: sec.login-limit — No limit on login attempts

If a login form accepts unlimited tries, a script can guess passwords all night until one works. Common passwords fall within minutes.

Hosted sign-in services (Supabase Auth, Firebase Auth, Clerk, Auth0, Cognito, Kinde, Stytch, WorkOS) limit attempts themselves. Sign-in only through Google, GitHub or similar (OAuth), or by emailed links or codes, has no password to guess. In both cases the questions below don't apply to that sign-in path.

First, find every place that checks a password the app stores itself (comparing a hash with `bcrypt.compare`, `argon2.verify` or similar, a `credentials` provider in NextAuth, or a database query by email and password). Name them in the `why` of question 1, or say there are none.

1. **Is the number of failed attempts limited per account or per visitor?**
   Fail: the handler checks the password and returns an error, with no counter, limiter or lockout around it.
   Pass: a rate limiter (`express-rate-limit`, `@upstash/ratelimit`, a counter in the database) wraps the login, or a hosted service does the check.
2. **Does repeated failure slow down or stop the next attempts (lockout, delay or captcha)?**
   Fail: the tenth wrong password in a row gets the same instant answer as the first.
   Pass: a temporary lockout, a growing delay, or a captcha after a few failures.
3. **Does the password-reset or code-check endpoint have the same protection?**
   Fail: `/api/reset` or a "verify code" endpoint accepts unlimited tries (a 6-digit code falls to a script).
   Pass: limited like the login, or handled by a hosted service.

Findings: one for each login path that fails, with file and line. Fix: "limit failed attempts (for example 5 per 15 minutes per account and per visitor), then slow down or ask for a captcha".
