const ACCEPT = /^(accept( all)?|allow( all)?|agree|i agree|got it|ok|okay|yes|אישור|מאשר|מאשרת|אני מסכים|אני מסכימה|קבל|קבלה|הסכמה|אוקיי|הבנתי)$/i;
const REJECT = /^(reject( all)?|decline|deny|no thanks|refuse|only (necessary|essential)|necessary only|essential only|דחייה|דחה|סירוב|לא תודה|רק הכרחיות|רק חיוניות|ללא)$/i;

/** Runs in the page: the consent banner's buttons and how each looks. */
function banner() {
  const roots = [...document.querySelectorAll("body *")].filter((el) => {
    if (!window.__lc.isVisible(el)) return false;
    const t = (el.innerText || "").slice(0, 600);
    return /cookie|עוגיות|קובצי cookie|consent|הסכמה לשימוש/i.test(t) && el.querySelectorAll("button, a, [role=button]").length >= 1 && t.length < 1500;
  });
  // the smallest element holding the text and the buttons
  const root = roots.sort((a, b) => a.innerText.length - b.innerText.length)[0];
  if (!root) return null;
  return [...root.querySelectorAll("button, a, [role=button]")].filter((b) => window.__lc.isVisible(b)).map((b) => {
    const s = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return { label: (b.innerText || b.getAttribute("aria-label") || "").trim(), area: Math.round(r.width * r.height), bg: s.backgroundColor, color: s.color, border: s.borderTopWidth, underline: s.textDecorationLine, size: parseFloat(s.fontSize), weight: Number(s.fontWeight), selector: window.__lc.cssPath(b) };
  });
}

const filled = (b) => !/rgba\(0, 0, 0, 0\)|transparent/.test(b.bg);

/** @type {import("../../types.js").Check} */
export default {
  id: "privacy.cookie-reject",
  layer: "browser",
  async run(ctx) {
    const [home] = await ctx.crawl.browserPages();
    if (!home) return [ctx.pass()];
    const buttons = await ctx.browser.fresh(home.url, { width: 1280 }, (p) => p.evaluate(banner));
    if (!buttons) return [ctx.pass()]; // no banner: privacy.cookie-blocks covers tracking without one
    const accept = buttons.find((b) => ACCEPT.test(b.label));
    if (!accept) return [ctx.pass()];
    const reject = buttons.find((b) => REJECT.test(b.label));
    const problems = [];
    if (!reject) problems.push(`only "${accept.label}" on the banner; saying no takes extra steps (or isn't possible)`);
    else {
      if (reject.area < accept.area * 0.6) problems.push(`"${reject.label}" is much smaller than "${accept.label}"`);
      if (filled(accept) && !filled(reject)) problems.push(`"${accept.label}" is a coloured button and "${reject.label}" ${reject.underline.includes("underline") ? "a plain link" : "plain text"}`);
      if (reject.size < accept.size - 1) problems.push(`"${reject.label}" uses smaller text`);
    }
    if (!problems.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "Saying no to cookies is harder than saying yes",
      impact: "Regulators in Europe treat a hidden or tiny reject option as no consent at all (fines have followed), and Israel's privacy authority expects the same; visitors also notice and trust the site less",
      location: { url: home.path, viewport: 1280, selector: (reject ?? accept).selector },
      evidence: problems.join("; "),
      fix: "Put a reject button on the banner, next to accept, with the same size and style (for example both as outlined buttons)",
      options: [
        { label: "Make both buttons the same (recommended)", detail: "Accept and Reject side by side, same size and style" },
        { label: "Add a reject button, keep accept highlighted", detail: "Better, but regulators may still see it as nudging" },
        { label: "Keep it as it is", detail: "Only if nothing on the site needs consent" },
      ],
    })];
  },
};
