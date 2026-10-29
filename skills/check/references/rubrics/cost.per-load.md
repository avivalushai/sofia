# Rubric: cost.per-load — Expensive calls on every page load

Some services charge for every call: AI models, image generation, maps, geocoding, translation, SMS, some databases. A call made every time a page opens multiplies the bill by the number of visitors and bots, and one viral day can cost more than a month.

Read the page code and the server code you were given.

1. **Is a paid call made automatically when a page loads?**
   Fail: a model, image, translation or maps API called in a page's load (a `useEffect` with no condition, a server component or a `getServerSideProps` that calls the model, an API route the page fetches on load) for content that's the same for everyone or rarely changes.
   Pass: paid calls happen only when the user acts (presses a button, sends a message), or their results are cached.
2. **Are repeated results cached?**
   Fail: the same prompt or the same address geocoded again on every request.
   Pass: results stored (a database, KV, static generation, `revalidate`) and reused.
3. **Can bots trigger the paid call?**
   Fail: a public page that calls the paid service on load, so every crawler visit costs money.
   Pass: the call needs a signed-in user or a real interaction, or it's cached for anonymous visitors.

Findings: one for each call, with file and line. Fix: "call it only when the visitor asks, or generate it once and store the result".
