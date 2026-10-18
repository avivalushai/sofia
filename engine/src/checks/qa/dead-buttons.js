import { interceptWrites } from "../../lib/browser-checks.js";

const MAX_PER_PAGE = 15;

/** Clickables that aren't plain links and aren't a form's submit button (the forms checks handle those). */
function listClickables() {
  const els = [...document.querySelectorAll('button, [role="button"], input[type="button"], a:not([href]), a[href="#"], a[href^="javascript:"]')];
  return els
    .filter((el) => window.__lc.isVisible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true")
    .filter((el) => !(el.form && (el.type === "submit" || (el.localName === "button" && !el.getAttribute("type")))))
    .map((el) => ({
      selector: window.__lc.cssPath(el),
      text: (el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").trim().replace(/\s+/g, " ").slice(0, 40),
    }));
}

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.dead-buttons",
  layer: "browser",
  async run(ctx) {
    const results = [];
    const tested = new Set();
    for (const page of await ctx.crawl.browserPages()) {
      const shared = await ctx.browser.open(page.url, { width: 1280 });
      const clickables = (await shared.evaluate(listClickables)).filter((c) => {
        const sig = `${c.text}|${c.selector}`;
        if (tested.has(sig)) return false;
        tested.add(sig);
        return true;
      }).slice(0, MAX_PER_PAGE);

      for (const c of clickables) {
        // each button from a fresh load, with every write answered by us so a click can't change real data
        const outcome = await ctx.browser.fresh(page.url, { width: 1280 }, async (p) => {
          const writes = await interceptWrites(p.page, "ok");
          const before = { url: p.page.url(), requests: p.log.requests.length, pages: p.page.context().pages().length };
          await p.evaluate(() => window.__lc.watchMutations());
          let dialog = false;
          p.page.once("dialog", (d) => {
            dialog = true;
            d.dismiss().catch(() => {});
          });
          try {
            await p.page.click(c.selector, { timeout: 3000 });
          } catch {
            return "unclickable";
          }
          await p.page.waitForTimeout(800);
          const changed =
            dialog ||
            writes.length > 0 ||
            p.page.url() !== before.url ||
            p.log.requests.length > before.requests ||
            p.page.context().pages().length > before.pages ||
            (await p.evaluate(() => window.__lcMutations).catch(() => 1)) > 0;
          return changed ? "works" : "dead";
        }).catch(() => "unclickable");
        if (outcome !== "dead") continue;
        const source = c.text ? await ctx.guessSource(c.text, page) : null;
        results.push(ctx.fail({
          key: `${page.path}_${c.selector}`,
          title: c.text ? `The "${c.text}" button does nothing` : "A button does nothing when clicked",
          impact: "Visitors click and nothing happens, so they assume the site is broken — and this is often the main call to action",
          location: { url: page.path, viewport: 1280, selector: c.selector, ...(source ?? {}) },
          evidence: `Clicking ${c.selector} changed nothing: no navigation, no request, no change on the page`,
          fix: "Make the button do what it says — link it to the right page or section, or connect it to its action",
          shot: await shared.screenshot({ highlight: c.selector }),
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
