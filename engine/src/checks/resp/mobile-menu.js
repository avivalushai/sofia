/** Runs in the page: the site's main navigation at this width, and a menu toggle if there is one. */
function inspectNav() {
  const navs = [...document.querySelectorAll('nav, [role="navigation"], header')];
  const internal = (a) => {
    try {
      return new URL(a.href).origin === location.origin;
    } catch {
      return false;
    }
  };
  const links = navs.flatMap((n) => [...n.querySelectorAll("a[href]")]).filter(internal);
  const visible = links.filter((a) => window.__lc.isVisible(a)).length;
  const toggleRe = /menu|hamburger|burger|nav-?toggle|navbar-toggler|תפריט/i;
  const toggle = [...document.querySelectorAll('button, [role="button"], [aria-controls], [aria-expanded]')]
    .filter((el) => window.__lc.isVisible(el))
    .find((el) => el.hasAttribute("aria-expanded") || toggleRe.test(`${el.getAttribute("aria-label") ?? ""} ${el.className} ${el.id} ${el.textContent}`));
  return { total: links.length, visible, toggle: toggle ? window.__lc.cssPath(toggle) : null };
}

const countVisibleNavLinks = () =>
  [...document.querySelectorAll('nav a[href], [role="navigation"] a[href], header a[href], [role="dialog"] a[href], [aria-modal] a[href]')].filter((a) => window.__lc.isVisible(a)).length;

/** @type {import("../../types.js").Check} */
export default {
  id: "resp.mobile-menu",
  layer: "browser",
  async run(ctx) {
    const width = ctx.viewports.mobile[0];
    const [home] = await ctx.crawl.browserPages();
    const p = await ctx.browser.open(home.url, { width });
    const nav = await p.evaluate(inspectNav);
    const fail = (key, title, evidence, selector = nav.toggle) =>
      ctx.fail({
        key,
        title,
        impact: "On a phone visitors can't get to the other pages, so most of them only ever see the home page",
        location: { url: home.path, viewport: width, selector },
        evidence,
        fix: "Make the menu button open the menu, let each link take you to its page, and let the menu close again",
        shot: selector ? p.screenshot({ highlight: selector }) : p.screenshot(),
      });

    if (nav.total === 0 || (nav.visible >= Math.min(nav.total, 2) && !nav.toggle)) return [ctx.pass()]; // links shown directly
    if (!nav.toggle) {
      const r = fail("no-toggle", "The menu disappears on phones", `${nav.total - nav.visible} of ${nav.total} menu links are hidden at ${width}px and there's no menu button`, null);
      r.shot = await r.shot;
      return [r];
    }

    const outcome = await ctx.browser.fresh(home.url, { width }, async (fp) => {
      const before = await fp.evaluate(countVisibleNavLinks);
      await fp.page.click(nav.toggle, { timeout: 3000 });
      await fp.page.waitForTimeout(600);
      const opened = await fp.evaluate(countVisibleNavLinks);
      if (opened <= before) return { step: "open", detail: `tapping ${nav.toggle} showed no new links` };
      await fp.page.click(nav.toggle, { timeout: 3000 }).catch(() => fp.page.keyboard.press("Escape"));
      await fp.page.waitForTimeout(600);
      const closed = await fp.evaluate(countVisibleNavLinks);
      if (closed >= opened) return { step: "close", detail: "tapping the menu button again (or Escape) didn't close it" };
      // reopen and follow the first new link
      await fp.page.click(nav.toggle, { timeout: 3000 });
      await fp.page.waitForTimeout(600);
      const target = await fp.evaluate(() => {
        const a = [...document.querySelectorAll('nav a[href], [role="navigation"] a[href], header a[href], [role="dialog"] a[href]')]
          .find((x) => window.__lc.isVisible(x) && new URL(x.href).origin === location.origin && new URL(x.href).pathname !== location.pathname);
        return a ? window.__lc.cssPath(a) : null;
      });
      if (!target) return { step: "ok" };
      const from = fp.page.url();
      await Promise.all([fp.page.waitForLoadState("load").catch(() => {}), fp.page.click(target, { timeout: 3000 })]);
      await fp.page.waitForTimeout(800);
      if (fp.page.url() === from) return { step: "navigate", detail: `tapping ${target} in the open menu didn't go anywhere` };
      return { step: "ok" };
    }).catch((e) => ({ step: "error", detail: e.message.split("\n")[0] }));

    if (outcome.step === "ok") return [ctx.pass()];
    if (outcome.step === "error") return [ctx.uncertain({ key: "menu", title: "Couldn't test the phone menu", evidence: outcome.detail, location: { url: home.path, viewport: width } })];
    const titles = { open: "The menu button doesn't open the menu", close: "The phone menu won't close", navigate: "Links in the phone menu don't work" };
    const r = fail(outcome.step, titles[outcome.step], outcome.detail);
    r.shot = await r.shot;
    return [r];
  },
};
