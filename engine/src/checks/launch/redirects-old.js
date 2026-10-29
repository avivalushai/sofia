const MAX = 30;

/** @type {import("../../types.js").Check} */
export default {
  id: "launch.redirects-old",
  layer: "mechanical",
  async run(ctx) {
    if (ctx.isLocalTarget) return [ctx.skip("old addresses are checked against the live domain")];
    const host = ctx.targetUrl.hostname.replace(/^www\./, "");
    // the Internet Archive's list of addresses it has seen on this domain (free, no key)
    const api = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(host)}/*&output=json&fl=original,statuscode,mimetype&filter=statuscode:200&filter=mimetype:text/html&collapse=urlkey&limit=400`;
    const res = await ctx.http.get(api).catch(() => null);
    if (!res || res.status !== 200) return [ctx.uncertain({ key: "site", title: "Couldn't get the site's old addresses", evidence: `the Internet Archive ${res ? `answered ${res.status}` : "didn't answer"}` })];
    let rows = [];
    try {
      rows = JSON.parse(res.body).slice(1);
    } catch {}
    const paths = [...new Set(rows.map(([u]) => {
      try {
        const x = new URL(u.startsWith("http") ? u : `https://${u}`);
        return x.pathname.replace(/\/$/, "") || "/";
      } catch {
        return null;
      }
    }).filter((p) => p && !/\.(js|css|png|jpe?g|gif|svg|ico|xml|txt|json|woff2?)$/i.test(p) && !/^\/(wp-|cgi-bin|feed)/.test(p)))];
    if (!paths.length) return [ctx.pass()];
    const gone = [];
    for (const p of paths.slice(0, MAX)) {
      await new Promise((r) => setTimeout(r, 200));
      const r = await ctx.http.get(new URL(p, ctx.target).href, { as: "none" }).catch(() => null);
      if (r && !r.blocked && (r.status === 404 || r.status === 410)) gone.push(p);
    }
    if (!gone.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: gone.length === 1 ? "An old address of the site now leads nowhere" : `${gone.length} old addresses of the site now lead nowhere`,
      impact: "Links from Google, other sites, old posts and people's bookmarks land on an error page, and the search ranking those pages had is lost",
      location: { url: gone[0] },
      evidence: `addresses the Internet Archive saw on ${host} that now answer 404: ${gone.slice(0, 6).join(", ")}${gone.length > 6 ? `, and ${gone.length - 6} more` : ""}`,
      fix: "Add a permanent (301) redirect from each old address to the closest new page",
      options: [
        { label: "Redirect each to its new page (recommended)", detail: "I'll suggest a match for each and you confirm the list" },
        { label: "Redirect them all to the home page", detail: "Quick, but Google treats it almost like a dead page" },
        { label: "Leave them", detail: "If those pages are truly gone and had no visitors" },
      ],
    })];
  },
};
