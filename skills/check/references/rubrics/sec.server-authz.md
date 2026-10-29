# Rubric: sec.server-authz — Permissions checked only in the UI

Hiding a button from non-admins isn't security: anyone can call the server directly. Every endpoint that reads or changes private data must check, on the server, who is asking.

Read the server code you were given (API routes, server actions, functions, middleware, database rules). Answer each question.

1. **Does every endpoint that reads or changes user data check that a user is signed in?**
   Fail: `export async function POST(req) { const data = await req.json(); await db.insert(...) }` with no session check.
   Pass: `const session = await auth(); if (!session) return new Response(null, { status: 401 })`, or middleware that protects the route.
2. **Does it check the signed-in user may access *that* record (not just that someone is signed in)?**
   Fail: `db.orders.find({ id: params.id })` returned to any signed-in user.
   Pass: `db.orders.find({ id: params.id, userId: session.user.id })`, or row-level security that does the same.
3. **Are admin-only actions checked for the admin role on the server?**
   Fail: the admin page hides the "delete user" button, but `/api/users/delete` only checks that someone is signed in.
   Pass: a role check on the server before the action.
4. **Is anything trusted from the request that decides access** (a `userId`, `role` or `isAdmin` sent by the browser)?
   Fail: `const { userId } = await req.json(); db.profile.update({ where: { id: userId } ... })`.
   Pass: the user id comes from the server-side session.

Public endpoints (a contact form, a public list) are fine without a check — say which ones you considered public and why.

Findings — one per endpoint, with file and line. Fix in plain words: "check on the server that the person asking owns this order".
