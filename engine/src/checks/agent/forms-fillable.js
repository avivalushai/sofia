/** Runs in the page: forms an agent would get stuck on. */
function scan() {
  const problems = [];
  // fields made of plain elements: agents (and assistive tech) don't see them as fields
  for (const el of document.querySelectorAll('[contenteditable=""], [contenteditable="true"], [role=textbox]')) {
    if (!window.__lc.isVisible(el) || el.closest("form") === null) continue;
    const name = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title");
    if (!name) problems.push({ selector: window.__lc.cssPath(el), what: "a typing area built from a plain element, with no name" });
  }
  for (const form of document.querySelectorAll("form")) {
    if (!window.__lc.isVisible(form)) continue;
    const fields = [...form.querySelectorAll("input, textarea, select")].filter((i) => !["hidden", "submit", "button", "image", "reset"].includes(i.type) && window.__lc.isVisible(i));
    if (!fields.length) continue;
    const submit = form.querySelector('button:not([type=button]):not([type=reset]), input[type=submit], input[type=image]') || (form.id && document.querySelector(`button[form="${form.id}"], input[type=submit][form="${form.id}"]`));
    if (!submit) problems.push({ selector: window.__lc.cssPath(form), what: "a form with no submit button (it only sends through a script on a non-button element)" });
    // "slide to submit", "press and hold": gestures an agent can't perform
    const gesture = [...form.querySelectorAll("*")].find((el) => /slide to|swipe to|press and hold|hold to|גרור|החליקו|לחצו והחזיקו/i.test(el.textContent ?? "") && el.children.length === 0);
    if (gesture) problems.push({ selector: window.__lc.cssPath(gesture), what: `a gesture to send ("${gesture.textContent.trim().slice(0, 40)}")` });
  }
  return problems;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "agent.forms-fillable",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      const problems = await p.evaluate(scan);
      if (!problems.length) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "An AI assistant couldn't fill in this form for someone",
        impact: "People increasingly ask assistants to book, sign up or send a message for them; a form an agent can't complete loses those visitors (and is often hard for keyboard and screen-reader users too)",
        location: { url: page.path, viewport: 1280, selector: problems[0].selector },
        evidence: problems.slice(0, 4).map((x) => x.what).join("; "),
        fix: "Use real form fields with labels, and a real submit button (<button type=\"submit\">) instead of a script on a div or a gesture",
        shot: await p.screenshot({ highlight: problems[0].selector }),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
