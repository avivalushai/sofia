const ANALYTICS = /gtag\(|googletagmanager\.com|google-analytics\.com|["']@vercel\/analytics["']|plausible\.io|posthog|mixpanel|amplitude|segment\.(com|io)|umami|fathom|clarity\.ms|hotjar/i;
// ways to keep the owner's own visits out of the numbers
const FILTERED = /location\.hostname[^;\n]{0,80}localhost|localhost[^;\n]{0,80}location\.hostname|\bis_?test\b|navigator\.webdriver|internal_?user|internal_traffic|traffic_type|debug_mode|opt_?out_?capturing|optOut\(|plausible_ignore|localStorage\.setItem\(\s*["']plausible_ignore|umami\.disabled|ignore[-_]?(me|internal)|exclude[-_]?(internal|me)|isInternal|location\.hostname\s*[!=]==?\s*["'](localhost|127\.0\.0\.1)|NODE_ENV\s*[!=]==?\s*["']production|VERCEL_ENV|import\.meta\.env\.PROD|process\.env\.NODE_ENV/;

/** @type {import("../../types.js").Check} */
export default {
  id: "analytics.internal",
  layer: "mechanical",
  async run(ctx) {
    let file = null;
    let all = "";
    for (const f of ctx.project.files.filter((f) => /\.(jsx?|tsx?|mjs|html?|vue|svelte|astro)$/.test(f) && !/\.(test|spec)\./.test(f))) {
      const t = (await ctx.project.read(f)) ?? "";
      if (ANALYTICS.test(t)) {
        file ??= f;
        all += `\n${t}`;
      }
    }
    for (const p of await ctx.crawl.pages()) if (ANALYTICS.test(p.html)) all += `\n${p.html}`;
    if (!all) return [ctx.pass()];
    if (FILTERED.test(all)) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "Your own visits are counted as visitors",
      impact: "In the first weeks most traffic is you and your team testing, so the numbers look better than they are and you can't trust conversions or which pages work",
      location: file ? { file } : { url: "/" },
      evidence: "analytics loads on every visit, including on localhost and with nothing that marks or skips your own visits",
      fix: "Load analytics only on the production domain, and exclude your own visits: in GA4 define internal traffic by your IP (Admin → Data streams → Configure tag settings → Define internal traffic) and activate the filter; in Plausible or PostHog use their 'exclude my visits' option on your devices",
    })];
  },
};
