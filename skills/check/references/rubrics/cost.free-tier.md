# Rubric: cost.free-tier — Free-tier limits

Most apps run on free plans: a database, email, hosting, AI credits, maps. Each has a limit, and what happens at the limit varies. Some services stop working, some start charging, and some pause the whole project after a week without visits. Owners usually find out on the worst day.

You were given the project's dependencies, configuration and the code that uses outside services.

First list each outside service the app depends on, and name them in the `why` of question 1.

1. **Are there services whose free limit a launch could reach quickly?**
   Fail: a service with a small free quota that the app uses on every visit or every sign-up (for example email at 100/day, a database with 500 MB, maps with a few thousand loads, AI credits). Explain the limit in the `why`, as well as you know it.
   Pass: limits far above the expected traffic, or a paid plan is configured.
2. **Does anything pause or sleep on the free plan?**
   Fail: a free database that pauses after a week without activity (Supabase free projects pause after 7 days), or a free server that sleeps and takes 30+ seconds to wake (Render free web services).
   Pass: nothing that sleeps, or a keep-alive or paid plan.
3. **Would hitting a limit break the site, or just cost money?**
   Fail: at the limit, sign-up, payment or the main page stops working, and the code shows no fallback or message.
   Pass: the app degrades gracefully (a clear message, a queue), or the limit only adds cost.

Findings: one for each service at risk, quoting the line where it's set up. Options are not needed (fixer: user). The fix is concrete steps: where to see usage, which plan, and what to set an alert on.
