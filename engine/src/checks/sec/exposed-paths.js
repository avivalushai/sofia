// Few, and only what AI-built JavaScript apps actually have: probing WordPress or PHP addresses
// looks like an attack scan to hosts' firewalls (Vercel, Cloudflare) and gets this machine blocked
const COMMON = ["/admin", "/dashboard"];
const SENSITIVE_ROUTE = /(^|\/)(admin|dashboard|internal|debug|test|staff|backoffice|manage|moderat\w*)(\/|$)/i;
const LOGIN = /log ?in|sign ?in|password|התחבר|כניסה|סיסמה/i;
const CRITICAL = /^\/(admin|wp-admin|administrator|api\/admin|backoffice|staff|internal)/;

/** Routes named like admin/debug pages, from the project's files. */
function routesFromCode(files) {
  const routes = new Set();
  for (const f of files) {
    const m = f.match(/^(?:src\/)?(?:app|pages|routes)\/(.+?)\/(?:page|index|\+page)\.(?:jsx?|tsx?|svelte|vue|astro)$/) ?? f.match(/^(?:src\/)?(?:pages|routes)\/(.+?)\.(?:jsx?|tsx?|svelte|vue|astro)$/);
    if (!m) continue;
    const route = `/${m[1].replace(/\([^)]+\)\/?/g, "").replace(/\/index$/, "")}`;
    if (SENSITIVE_ROUTE.test(route) && !/[[\]]/.test(route)) routes.add(route);
  }
  return [...routes].sort();
}

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.exposed-paths",
  // asks for addresses like /.env or /admin: runs last, see runner
  probe: true,
  layer: "browser",
  async run(ctx) {
    const origin = new URL(ctx.target).origin;
    const paths = [...new Set([...COMMON, ...routesFromCode(ctx.project.files)])];
    // what this site shows for an address that doesn't exist — single-page apps answer 200 for everything
    const missing = await ctx.browser.open(new URL("/launch-check-page-that-does-not-exist", origin).href, { width: 1280 });
    const missingText = await missing.evaluate(() => window.__lc.visibleText());
    const home = await ctx.browser.open(new URL("/", origin).href, { width: 1280 });
    const homeText = await home.evaluate(() => window.__lc.visibleText());

    const results = [];
    for (const path of paths) {
      await new Promise((r) => setTimeout(r, 400)); // spaced out, like a person clicking around
      const res = await ctx.http.get(new URL(path, origin).href, { as: "none", follow: false }).catch(() => null);
      if (!res || res.status !== 200) continue; // redirects (usually to login), 401/403/404 are fine
      const p = await ctx.browser.open(new URL(path, origin).href, { width: 1280 });
      const page = await p.evaluate(() => ({ text: window.__lc.visibleText(), password: !!document.querySelector('input[type="password"]'), url: location.pathname }));
      if (page.password || LOGIN.test(page.text.slice(0, 400)) || page.text === missingText || page.text === homeText || page.text.length < 40 || page.url !== path.replace(/\/$/, "") && page.url !== path) continue;
      results.push(ctx.fail({
        key: path,
        title: CRITICAL.test(path) ? "An admin page opens without logging in" : "A test or internal page is open to anyone",
        impact: "Anyone who guesses the address can see — and maybe change — things only you should, like other people's details or settings",
        location: { url: path, viewport: 1280 },
        evidence: `${path} shows a page (${page.text.length} characters of content) with no login`,
        fix: "Put it behind a login, or remove it if it was only for testing",
        options: [
          { label: "Require a login (recommended)", detail: "Only signed-in admins can open it" },
          { label: "Remove the page", detail: "If it was only for building or testing" },
        ],
        shot: await p.screenshot(),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
