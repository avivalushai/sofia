import { ANALYTICS_HOSTS, COOKIELESS } from "../../lib/browser-checks.js";

const TRACKING_COOKIE = /^(_ga|_gid|_gat|_fbp|_fbc|_gcl_|_hj|_clck|_clsk|_ttp|_uetsid|_uetvid|ajs_|mp_|_pin_unauth|li_|hubspotutk)/;

/** @type {import("../../types.js").Check} */
export default {
  id: "privacy.cookie-blocks",
  layer: "browser",
  async run(ctx) {
    const [home] = await ctx.crawl.browserPages();
    const origin = new URL(ctx.target).origin;
    // a brand-new visitor who hasn't clicked anything yet
    return ctx.browser.fresh(home.url, { width: 1280 }, async (p) => {
      const trackers = [...new Set(p.log.requests.map((r) => r.url).filter((u) => ANALYTICS_HOSTS.test(u) && !COOKIELESS.test(u)).map((u) => new URL(u).host))].sort();
      const cookies = (await p.page.context().cookies()).map((c) => c.name).filter((n) => TRACKING_COOKIE.test(n)).sort();
      if (!trackers.length && !cookies.length) return [ctx.pass()];
      const banner = await p.evaluate(() => {
        const text = window.__lc.visibleText();
        return /cookie|עוגיות|קובצי cookie/i.test(text);
      });
      return [ctx.fail({
        key: "site",
        title: banner ? "Visitors are tracked before they agree to cookies" : "Visitors are tracked without being asked",
        impact: banner
          ? "The cookie banner is just decoration: tracking starts before anyone clicks, which breaks privacy law in the EU and Israel"
          : "Tracking tools start the moment someone arrives, with no way to say no — that breaks privacy law in the EU and Israel",
        location: { url: home.path, viewport: 1280 },
        evidence: [trackers.length ? `Loaded before consent: ${trackers.join(", ")}` : null, cookies.length ? `Tracking cookies set: ${cookies.join(", ")}` : null].filter(Boolean).join("; "),
        fix: banner ? "Load the tracking tools only after the visitor clicks Accept, and add a No thanks button" : "Add a cookie banner with Accept and No thanks, and load tracking only after Accept",
        shot: await p.screenshot(),
      })];
    });
  },
};
