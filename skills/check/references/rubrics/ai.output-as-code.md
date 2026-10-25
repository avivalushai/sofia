# Rubric: ai.output-as-code — Model output rendered as code

A model's answer can contain HTML or script — because a user asked for it, or because someone planted text the model repeats. Inserted into the page as HTML, it runs in visitors' browsers.

Read the files you were given. Answer each question.

1. **Is model output inserted as raw HTML anywhere?**
   Fail: `dangerouslySetInnerHTML={{ __html: aiResponse }}`, `el.innerHTML = completion`, `v-html="answer"`, `{@html reply}`.
   Pass: rendered as text (`{aiResponse}`), or passed through a sanitizer (DOMPurify, sanitize-html) first.
2. **Is model output converted from Markdown to HTML without sanitizing?**
   Fail: `marked(answer)` or `markdown-it` with `html: true`, result inserted as HTML.
   Pass: a Markdown renderer that escapes HTML (react-markdown without `rehype-raw`), or sanitized output.
3. **Is model output ever executed or used to build code, queries or URLs?**
   Fail: `eval(response)`, `new Function(...)`, a SQL string built from model output, `window.location = modelText`.
   Pass: none.
4. **Is model output sent on to other people (shared chats, public pages, emails) without the same protection?**
   Fail: a public "share this answer" page that renders the stored answer as HTML.
   Pass: escaped or sanitized there too.

Findings — one per place, with file and line. Fix: "show the answer as plain text (or sanitize it) so code inside it can't run".
