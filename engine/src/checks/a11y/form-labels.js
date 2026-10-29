/**
 * Runs in the page: fields with no label. axe-core accepts a placeholder as a name, but the
 * placeholder disappears as soon as someone types, so here it doesn't count.
 */
function unlabelledFields() {
  return [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => !["hidden", "submit", "button", "reset", "image"].includes(el.type) && window.__lc.isVisible(el))
    .filter((el) => {
      const byFor = el.id && [...document.querySelectorAll("label")].some((l) => l.htmlFor === el.id && l.textContent.trim());
      const wrapped = el.closest("label")?.textContent.trim();
      const aria = el.getAttribute("aria-label")?.trim() || (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).some((id) => document.getElementById(id)?.textContent.trim());
      return !(byFor || wrapped || aria || el.title?.trim());
    })
    .map((el) => ({ selector: window.__lc.cssPath(el), placeholder: el.placeholder || null }));
}

/** @type {import("../../types.js").Check} */
export default {
  id: "a11y.form-labels",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      const fields = await p.evaluate(unlabelledFields);
      if (!fields.length) continue;
      const first = fields[0];
      const source = first.placeholder ? await ctx.guessSource(`placeholder="${first.placeholder}"`, page) : null;
      results.push(ctx.fail({
        key: page.path,
        title: fields.length === 1 ? "A form field has no label" : `${fields.length} form fields have no label`,
        impact: "Screen readers announce just \"edit text\", and once someone starts typing the hint inside the field disappears, so they forget what it was for",
        location: { url: page.path, viewport: 1280, selector: first.selector, ...(source ?? {}) },
        evidence: fields.slice(0, 4).map((f) => `${f.selector} ${f.placeholder ? `has only a placeholder ("${f.placeholder}")` : "has no label"}`).join("; "),
        fix: "Give each field a visible label above it",
        shot: await p.screenshot({ highlight: first.selector }),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
