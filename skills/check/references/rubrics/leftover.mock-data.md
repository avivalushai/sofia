# Rubric: leftover.mock-data — Mock data shown as real

AI builders fill screens with invented content so the app looks alive: names, reviews, stats, prices, "recent activity". Shipped as is, visitors take it as fact.

Read the files you were given (and `pages.txt`, the visible text of each page). Answer each question.

1. **Are there numbers presented as facts that the code doesn't count or load from anywhere?**
   Fail: `<p>1,247 happy customers</p>`, `const stats = { users: 5000 }` shown as "5,000 users".
   Pass: a number read from the database or an API, or clearly not a claim ("Step 1 of 3", prices the owner set).
2. **Are there testimonials, reviews or ratings with invented people?**
   Fail: an array of `{ name: "Sarah Johnson", text: "Amazing product!", rating: 5 }` rendered as testimonials; "דנה כהן" quotes in a hard-coded list.
   Pass: reviews loaded from a real source, or the section is clearly labelled as an example.
3. **Are lists, tables or feeds filled with sample records instead of real data?**
   Fail: `const orders = [{ id: 1, customer: "John Doe" ... }]` rendered on a dashboard; a "recent sign-ups" feed from a constant.
   Pass: the same list comes from the database, an API or the user's own input.
4. **Are logos, "as seen in", partner or award claims there without any sign they're real?**
   Fail: a "Trusted by" row of big-company logos from a placeholder folder.
   Pass: none, or the owner's real partners.

Uncertain is right when you can't tell whether a number or name is real (for example a single founder quote with a plausible name). Say why.

Findings — one per kind of invented content (not one per item). This check is `choice`: give 2–3 options, first recommended, for example:
- "Replace with real numbers / reviews" — "Tell me the real figures or paste real reviews"
- "Remove the section until there's real data"
- "Label it as an example"
