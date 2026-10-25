# Rubric: qa.empty-states — Empty states

A new user has no projects, no orders, no messages. If a list just renders nothing, they see a blank area and think the app is broken.

Read the files you were given. Answer each question.

1. **Does every list, table, feed or grid of user data show something helpful when there are no items?**
   Fail: `items.map(...)` rendered with nothing for `items.length === 0`; a dashboard table with headers and no rows.
   Pass: `items.length === 0 ? <Empty>No projects yet — create your first one</Empty> : items.map(...)`.
2. **Do search and filter results say so when nothing matches?**
   Fail: an empty results area after searching.
   Pass: "Nothing matches 'xyz'" and a way to clear the search.
3. **Does the empty state tell people what to do next?**
   Fail: only "No data".
   Pass: a short sentence and the main action ("Add your first client").

Lists of fixed content the owner wrote (a features list, a pricing table) don't need empty states — skip them. Answer pass when every list of user data handles being empty.

Findings — one per screen or component, with file and line. Fix: what the empty state should say and which action it should offer.
