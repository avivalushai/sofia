/** @type {import("../../types.js").Check} */
export default {
  id: "behave.back-button",
  layer: "browser",
  async run(ctx) {
    const [home] = await ctx.crawl.browserPages();
    if (!home) return [ctx.pass()];
    const origin = ctx.targetUrl.origin;
    const r = await ctx.browser.fresh(home.url, { width: 390 }, async (p) => {
      const before = { url: p.page.url(), text: await p.evaluate(() => window.__lc.visibleText().slice(0, 300)) };
      // a link inside the site, followed the way a visitor does: a click, not a fresh load
      const link = await p.evaluate((o) => {
        const a = [...document.querySelectorAll("a[href]")].find((x) => {
          if (!window.__lc.isVisible(x)) return false;
          try {
            const u = new URL(x.href);
            return u.origin === o && u.pathname !== location.pathname && !/\.(pdf|zip|png|jpe?g)$/i.test(u.pathname) && !x.target;
          } catch {
            return false;
          }
        });
        return a ? { selector: window.__lc.cssPath(a), href: a.href } : null;
      }, origin);
      if (!link) return null;
      await p.page.locator(link.selector).first().click({ timeout: 3000 }).catch(() => {});
      await p.page.waitForTimeout(1200);
      const moved = p.page.url() !== before.url;
      if (!moved) return { link, moved };
      await p.page.goBack({ timeout: 8000 }).catch(() => {});
      await p.page.waitForTimeout(1200);
      const after = { url: p.page.url(), text: await p.evaluate(() => window.__lc?.visibleText().slice(0, 300) ?? document.body?.innerText.slice(0, 300) ?? "").catch(() => "") };
      return { link, moved, before, after };
    });
    if (!r || !r.moved) return [ctx.pass()];
    const backHome = r.after.url.split("#")[0] === r.before.url.split("#")[0];
    const sameContent = r.after.text && r.before.text && r.after.text.slice(0, 120) === r.before.text.slice(0, 120);
    if (backHome && (sameContent || r.after.text.length > 20)) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "The Back button doesn't return to the previous page",
      impact: "The Back button is the most used button on phones; when it leaves the site, lands somewhere else or shows an empty page, people get lost and many leave",
      location: { url: home.path, viewport: 390, selector: r.link.selector },
      evidence: `from ${new URL(r.before.url).pathname}, clicked a link to ${new URL(r.link.href).pathname}, then pressed Back: ${backHome ? "the page came back empty" : `ended at ${r.after.url.startsWith(origin) ? new URL(r.after.url).pathname : r.after.url}`}`,
      fix: "Navigate with real links (or the router's push, not replace), and restore the page's content when people come back (don't rely on state that's lost on Back)",
    })];
  },
};
