const LANG_LABEL = /^(english|עברית|hebrew|русский|العربية|français|español|deutsch|en|he|ru|ar|fr|es|de|eng|heb)$/i;
const LOCALE_PREFIX = /^\/(en|he|iw|ru|ar|fr|es|de|it|pt)(-[a-z]{2})?(?=\/|$)/i;

const bare = (path) => (path.replace(LOCALE_PREFIX, "").replace(/\/$/, "").replace(/\.html$/, "") || "/");

/** Runs in the page: links that switch the language. */
function switchers(labelSrc) {
  const LABEL = new RegExp(labelSrc, "i");
  return [...document.querySelectorAll("a[href][hreflang], a[href], button")]
    .filter((el) => window.__lc.isVisible(el) && (el.hasAttribute("hreflang") || LABEL.test((el.innerText || el.getAttribute("aria-label") || "").trim())))
    .map((el) => ({ selector: window.__lc.cssPath(el), href: el.href ?? null, label: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("hreflang")).trim().slice(0, 20) }));
}

/** @type {import("../../types.js").Check} */
export default {
  id: "rtl.switcher",
  layer: "browser",
  async run(ctx) {
    // the switcher only shows its problem on an inner page: on the home page "go home" is right
    const inner = (await ctx.crawl.browserPages()).filter((p) => bare(new URL(p.url).pathname) !== "/").slice(0, 3);
    if (!inner.length) return [ctx.pass()];
    // which pages exist in each language: "/en" + "/pricing.html" → en has /pricing
    const all = (await ctx.crawl.browserPages()).map((p) => new URL(p.url).pathname);
    const prefixOf = (path) => (path.match(LOCALE_PREFIX)?.[0] ?? "").toLowerCase();
    const exists = (prefix, barePath) => all.some((p) => prefixOf(p) === prefix && bare(p) === barePath);
    const wrong = [];
    let found = false;
    for (const page of inner) {
      const from = bare(new URL(page.url).pathname);
      const p = await ctx.browser.open(page.url, { width: 1280 });
      for (const s of await p.evaluate(switchers, LANG_LABEL.source)) {
        found = true;
        let to;
        if (s.href) to = new URL(s.href).pathname;
        else {
          // a button: click it in a copy of the page and see where it lands
          to = await ctx.browser.fresh(page.url, { width: 1280 }, async (f) => {
            await f.page.locator(s.selector).first().click({ timeout: 3000 }).catch(() => {});
            await f.page.waitForTimeout(1200);
            return new URL(f.page.url()).pathname;
          });
        }
        // the other language has this page, but the switcher goes somewhere else
        if (bare(to) !== from && exists(prefixOf(to), from)) wrong.push({ path: page.path, label: s.label, to, selector: s.selector });
      }
    }
    if (!found) {
      return [ctx.uncertain({ key: "site", title: "Couldn't find the language switcher", evidence: "the site has more than one language, but no link or button named after a language was found on the inner pages" })];
    }
    if (!wrong.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "Switching language sends people back to the home page",
      impact: "Someone reading a page who switches to their language loses their place and has to find the page again, and many won't bother",
      location: { url: wrong[0].path, viewport: 1280, selector: wrong[0].selector },
      evidence: wrong.slice(0, 3).map((w) => `"${w.label}" on ${w.path} goes to ${w.to}`).join("; "),
      fix: "Make each language link point to the same page in the other language (for example /pricing ↔ /en/pricing)",
    })];
  },
};
