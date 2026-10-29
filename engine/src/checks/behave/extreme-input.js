import { findForms } from "../../lib/browser-checks.js";

const LONG = "Wolfeschlegelsteinhausenbergerdorff".repeat(4);
// names people really have, which strict patterns reject
const NAMES = ["דנה כהן", "Zoë O'Brien-Smith", "José Núñez", "李小龙"];

/** Runs in the page: name fields whose pattern refuses real names. */
function strictNames([sel, names]) {
  const f = document.querySelector(sel);
  const out = [];
  for (const el of f.querySelectorAll("input")) {
    const hint = `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("autocomplete") ?? ""} ${el.labels?.[0]?.innerText ?? ""}`;
    if (!/name|שם/i.test(hint) || /user|email|company|file/i.test(hint) || !el.pattern) continue;
    let re;
    try {
      re = new RegExp(`^(?:${el.pattern})$`, "v");
    } catch {
      continue;
    }
    const refused = names.filter((n) => !re.test(n));
    if (refused.length) out.push({ selector: window.__lc.cssPath(el), pattern: el.pattern, refused });
  }
  return out;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "behave.extreme-input",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const form of await findForms(ctx)) {
      const r = await ctx.browser.fresh(form.url, { width: 390 }, async (p) => {
        const strict = await p.page.evaluate(strictNames, [form.selector, NAMES]);
        const widthBefore = await p.page.evaluate(() => document.documentElement.scrollWidth);
        // a very long word and emoji in every text field, the way a real (or careless) visitor might
        await p.page.evaluate(([sel, long]) => {
          for (const el of document.querySelector(sel).querySelectorAll("input:not([type]), input[type=text], input[type=search], textarea")) {
            if (!window.__lc.isVisible(el) || el.readOnly || el.disabled) continue;
            Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set.call(el, `${long} 🎉👩‍👩‍👧`);
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }, [form.selector, LONG]);
        await p.page.waitForTimeout(500);
        const widthAfter = await p.page.evaluate(() => document.documentElement.scrollWidth);
        const viewport = await p.page.evaluate(() => document.documentElement.clientWidth);
        return { strict, broke: widthAfter > Math.max(widthBefore, viewport) + 1 ? widthAfter - viewport : 0 };
      });
      if (r.strict.length) {
        results.push(ctx.fail({
          key: `${form.path}_${form.selector}_names`,
          title: "The name field refuses real names",
          impact: "People whose names have Hebrew letters, accents, apostrophes or hyphens can't fill in the form, or have to misspell their own name",
          location: { url: form.path, viewport: 390, selector: r.strict[0].selector },
          evidence: r.strict.map((s) => `pattern "${s.pattern}" refuses ${s.refused.map((n) => `"${n}"`).join(", ")}`).join("; "),
          fix: "Remove the pattern from name fields (or allow any letters: [\\p{L}\\p{M} '\\-.]+ with the u flag); check only that it isn't empty",
        }));
      }
      if (r.broke) {
        results.push(ctx.fail({
          key: `${form.path}_${form.selector}_long`,
          title: "A long entry breaks the page layout",
          impact: "When someone types a long name or word, the page starts scrolling sideways on phones and parts of it are cut off",
          location: { url: form.path, viewport: 390, selector: form.selector },
          evidence: `after typing a ${LONG.length}-letter word in "${form.label || "the form"}", the page became ${r.broke}px wider than the screen`,
          fix: "Let long text wrap where it's shown (overflow-wrap: anywhere) and keep fields at width: 100% with max-width",
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
