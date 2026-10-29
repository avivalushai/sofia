# Rubric: data.delete-export — Account deletion and data export

People who sign up need a way to delete their account and to get a copy of their data. Privacy laws require it in Europe (GDPR), California and Israel. The App Store and Google Play require in-app account deletion for any app with sign-up. Users also look for it before they trust a new service.

Read the files you were given, including the pages' visible text if it's listed. Look for a settings, account or profile area and what it offers.

1. **Can a signed-in person delete their account from inside the app?**
   Fail: no delete-account action anywhere, or only "email us to delete" with no address shown.
   Pass: a "Delete account" button or page that calls an endpoint that removes the user (or marks them for deletion), or a clearly shown request flow with a contact address.
2. **Does deleting also remove (or anonymise) their data, not only the login?**
   Fail: the endpoint deletes the auth user, but the notes, orders or uploads stay linked to them.
   Pass: related rows and files are deleted too, by cascade or by explicit calls.
   If there is no deletion at all (question 1 failed), answer `fail` here too, with the same quote.
3. **Can a person download a copy of their data?**
   Fail: no export or download option, and no stated way to request one.
   Pass: an "Export my data" or "Download" action (JSON or CSV), or a request flow with a contact address shown in the app or the privacy policy page.

Findings: one finding for deletion (questions 1–2) and one for export (question 3), each quoting the closest relevant line (for example the settings page, or the user endpoint that has no delete). Options for deletion: (1) a "Delete account" button in settings that removes the account and its data (recommended); (2) a request form that emails you, deleted within 30 days; (3) a support address in the app and the privacy policy. Options for export: (1) an "Export my data" button that downloads a JSON or CSV file (recommended); (2) a request by email answered within 30 days.
