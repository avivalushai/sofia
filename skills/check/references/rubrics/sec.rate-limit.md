# Rubric: sec.rate-limit — No rate limit on expensive endpoints

An endpoint that calls a paid service (an AI model, email, SMS, image generation, maps) can be called a thousand times by a script. The bill arrives at the owner.

Read the server code you were given. First find every endpoint that calls a service that costs money per call (AI APIs, email or SMS senders, payment or image services) and name them in the `why` of question 1. Then answer each question for those endpoints.

1. **Is each of them limited per visitor or per account?**
   Fail: `/api/chat` forwards every request to the model with no limit.
   Pass: a rate limiter (Upstash ratelimit, a counter per user or IP, the host's firewall rule, a daily quota per account).
2. **Is it protected from anonymous, unlimited use?**
   Fail: anonymous visitors can call the AI endpoint with no limit and no captcha.
   Pass: sign-in required, or a strict limit for anonymous use.
3. **Is there a cap on how big a single request can be** (prompt length, number of emails, file size)?
   Fail: the user's text goes to the model at any length.
   Pass: input length checked, `max_tokens` set.

When no endpoint calls a paid service, every question doesn't apply: answer pass with "Doesn't apply:".

Findings — one per endpoint, with file and line. This check is `choice`: options such as
- "Limit each visitor to N requests per minute" (recommended)
- "Require sign-in, then limit per account"
- "Add a daily budget cap in the provider's dashboard" (your action)
