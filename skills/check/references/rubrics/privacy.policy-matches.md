# Rubric: privacy.policy-matches — The privacy policy matches what the site collects

A privacy policy that leaves out what the site actually collects or shares is worse than a vague one. It's a false statement to users, and under Israeli privacy law (Amendment 13, in force since August 2025) and GDPR that's what regulators and lawsuits look for.

You were given the privacy policy page's text (in the pages' text) and the code that collects data or loads outside tools. If there is no privacy policy page at all, answer every question `fail` and quote a line that shows a form or a tool, since `privacy.policy` reports the missing page itself.

1. **Does the policy name every kind of personal data the site collects?**
   Fail: forms collect phone, address, ID number, birth date, health or payment details (or the app stores them) and the policy doesn't mention them.
   Pass: every field kind collected is covered, even if in general words ("contact details").
2. **Does it name the outside services that receive data?**
   Fail: analytics, ad pixels, session replay, chat widgets, email or payment services run on the site (or receive data from the server) and the policy doesn't mention them or the category ("analytics providers").
   Pass: each service, or a clear category for it, is listed.
3. **Does it say how to see, correct or delete your data, and whom to contact?**
   Fail: no contact for privacy requests, or no word about access and deletion.
   Pass: a contact address and how requests are handled.
4. **Does it match the business: its name, its country, its current product?**
   Fail: a template left unfilled ("[Company Name]", "Lorem"), another company's name, or a product the site doesn't have.
   Pass: it's clearly this business's policy.

Findings: one for each gap, quoting the policy line closest to it (or the code that collects the data). Options: (1) update the policy to list what's missing, with suggested text (recommended); (2) stop collecting what isn't needed; (3) keep it as it is.
