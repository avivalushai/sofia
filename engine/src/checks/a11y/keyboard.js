const PRESSES = 60;

/** Runs in the page: things you can click but can't reach with the keyboard. */
function clickOnly() {
  const native = "a[href], button, input, select, textarea, summary, label, [tabindex], [contenteditable]";
  return [...document.body.querySelectorAll("*")]
    .filter((el) => {
      if (el.matches(native) || el.closest("a[href], button, label, summary") || !window.__lc.isVisible(el)) return false;
      const pointer = getComputedStyle(el).cursor === "pointer";
      const role = /^(button|link|tab|menuitem|checkbox|switch|option)$/.test(el.getAttribute("role") ?? "");
      if (!(el.hasAttribute("onclick") || role || pointer)) return false;
      // only the outermost: its parent isn't clickable for the same reason
      const parent = el.parentElement;
      return !(parent && getComputedStyle(parent).cursor === "pointer" && pointer && !role && !el.hasAttribute("onclick"));
    })
    .filter((el) => (el.innerText || el.getAttribute("aria-label") || "").trim())
    .slice(0, 10)
    .map((el) => ({ selector: window.__lc.cssPath(el), label: (el.innerText || el.getAttribute("aria-label")).trim().slice(0, 30) }));
}

/** @type {import("../../types.js").Check} */
export default {
  id: "a11y.keyboard",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      const found = await ctx.browser.fresh(page.url, { width: 1280 }, async (p) => {
        const unreachable = await p.evaluate(clickOnly);
        const focusable = await p.evaluate(() => [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => window.__lc.isVisible(el)).length);
        // press Tab and watch where focus goes; stuck on the same one or two elements = a trap
        const path = [];
        await p.page.mouse.click(1, 1).catch(() => {});
        for (let i = 0; i < Math.min(PRESSES, focusable + 5); i++) {
          await p.page.keyboard.press("Tab");
          path.push(await p.evaluate(() => (document.activeElement && document.activeElement !== document.body ? window.__lc.cssPath(document.activeElement) : "body")));
        }
        const seen = new Set(path.filter((x) => x !== "body"));
        let trap = null;
        for (let i = 6; i < path.length && !trap; i++) {
          const window6 = new Set(path.slice(i - 6, i));
          if (window6.size <= 2 && !window6.has("body") && seen.size < focusable - 2) trap = [...window6][0];
        }
        const shot = trap || unreachable.length ? await p.screenshot({ highlight: trap ?? unreachable[0].selector }) : null;
        return { unreachable, trap, shot };
      });
      if (!found.trap && !found.unreachable.length) continue;
      results.push(ctx.fail({
        key: page.path,
        title: found.trap ? "Keyboard users get stuck on this page" : found.unreachable.length === 1 ? "A control can't be reached with the keyboard" : `${found.unreachable.length} controls can't be reached with the keyboard`,
        impact: found.trap
          ? "People who use the keyboard instead of a mouse (including many with motor disabilities) can't get past this point, so the rest of the page is out of reach"
          : "People who use the keyboard instead of a mouse can't use these, and screen readers don't announce them as buttons",
        location: { url: page.path, viewport: 1280, selector: found.trap ?? found.unreachable[0].selector },
        evidence: [found.trap && `Tab keeps returning to ${found.trap}`, ...found.unreachable.slice(0, 4).map((u) => `"${u.label}" reacts to clicks but isn't a button or link`)].filter(Boolean).join("; "),
        fix: found.trap ? "Let Tab move on from this element (and Escape close it, if it's a dialog)" : "Use a real <button> (or <a href>) for each of these, or add tabindex=\"0\", role=\"button\" and an Enter/Space key handler",
        shot: found.shot,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
