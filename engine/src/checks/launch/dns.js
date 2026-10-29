/** @type {import("../../types.js").Check} */
export default {
  id: "launch.dns",
  layer: "mechanical",
  async run(ctx) {
    if (ctx.isLocalTarget) return [ctx.skip("scanning a local address — domain records only exist for the live domain")];
    const host = ctx.targetUrl.hostname;
    const bare = host.replace(/^www\./, "");
    const problems = [];
    let a;
    let wwwA;
    let wwwCname;
    try {
      [a, wwwA, wwwCname] = await Promise.all([ctx.dns.a(bare), ctx.dns.a(`www.${bare}`), ctx.dns.cname(`www.${bare}`)]);
    } catch (e) {
      return [ctx.uncertain({ key: "site", title: "Couldn't read the domain's records", evidence: e.message })];
    }
    if (!a.length) problems.push(`${bare} has no address record (A), so the bare domain doesn't open`);
    if (!wwwA.length && !wwwCname.length) problems.push(`www.${bare} has no record, so the www address doesn't open`);
    // a www record pointing to a platform address that no longer serves this site
    for (const c of wwwCname) {
      if (/\.(herokudns|herokuapp|github\.io|netlify\.app|vercel-dns|pages\.dev|azurewebsites|cloudfront)\b/i.test(c)) {
        const r = await ctx.http.request(`https://www.${bare}/`, { as: "none" }).catch(() => null);
        if (!r || r.status === 404) problems.push(`www.${bare} points to ${c}, which doesn't serve the site (a dangling record anyone could claim)`);
      }
    }
    if (!problems.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "The domain's records are incomplete",
      impact: "Some visitors get \"site can't be reached\" depending on how they type the address, and a record pointing to an abandoned service can let someone else take over that address",
      location: { url: "/" },
      evidence: problems.join("; "),
      fix: "In your domain's DNS settings, add the records your host asks for, for both the bare domain and www (your host's domain page lists the exact values), and delete records that point to services you no longer use",
    })];
  },
};
