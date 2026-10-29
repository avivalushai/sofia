# Rubric: sec.xss-output — Visitors' content rendered as code

Anything a visitor can type (a name, a comment, a note, a review, a search term, a part of the address) can contain HTML or script. If the app later puts it into a page as HTML, the script runs in the browser of whoever views it, and can act as them.

Model (AI) answers are judged by `ai.output-as-code`. Don't count them here.

Read the files you were given. Answer each question.

1. **Is content from visitors or the database inserted as raw HTML anywhere?**
   Fail: `el.innerHTML = items.map((n) => \`<li>${n.title}</li>\`)`, `dangerouslySetInnerHTML={{ __html: comment.body }}`, `v-html="review.text"`, `{@html post.content}`, `insertAdjacentHTML(..., user.name)`, `document.write(...)` with stored data.
   Pass: rendered as text (`{comment.body}`, `textContent`), or passed through a sanitizer (DOMPurify, sanitize-html) first.
2. **Is anything from the address bar (query string, hash, path) put into the page as HTML or used as a link target?**
   Fail: `el.innerHTML = new URLSearchParams(location.search).get("q")`, `location.href = params.get("next")` without checking it stays on this site.
   Pass: shown as text; redirects only to known paths on this site.
3. **Can a visitor-supplied link run code when clicked?**
   Fail: `<a href={profile.website}>` with no check that it starts with `http://` or `https://` (a `javascript:` link would run).
   Pass: links are checked or built from a known prefix.
4. **Is visitor Markdown or rich text turned into HTML without sanitizing?**
   Fail: `marked(post.body)` or `markdown-it` with `html: true`, the result inserted as HTML.
   Pass: a renderer that escapes HTML (react-markdown without `rehype-raw`), or sanitized output.

Findings: one for each place, with file and line. Fix: "show it as plain text (or sanitize it first) so code inside it can't run".
