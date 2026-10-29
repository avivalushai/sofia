/** @type {import("../../types.js").Check} */
export default {
  id: "launch.canonical-host",
  layer: "mechanical",
  async run(ctx) {
    if (ctx.isLocalTarget) return [ctx.skip("scanning a local address — www and the bare domain are set up by your host on the live site")];
    const host = ctx.targetUrl.hostname;
    const bare = host.replace(/^www\./, "");
    // subdomains (app.example.com) and platform addresses don't have a www twin
    if (bare.split(".").length > 2 && !/\.(co|org|net|ac|gov)\.[a-z]{2}$/.test(bare)) return [ctx.pass()];
    const variants = [`https://${bare}/`, `https://www.${bare}/`];
    const ends = [];
    for (const v of variants) {
      const r = await ctx.http.request(v, { as: "none" }).catch((e) => ({ error: e.message }));
      ends.push({ from: v, to: r.error ? null : new URL(r.url).host, status: r.status, error: r.error });
    }
    const broken = ends.filter((e) => e.error || e.status >= 400);
    const hosts = new Set(ends.filter((e) => !e.error && e.status < 400).map((e) => e.to));
    if (!broken.length && hosts.size <= 1) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: broken.length ? "One version of the address doesn't work" : "The site answers at two addresses",
      impact: broken.length
        ? "People who type the address with (or without) www get an error, and links shared that way are dead"
        : "Google sees two copies of every page and splits their ranking between them, and logins on one address don't carry over to the other",
      location: { url: "/" },
      evidence: ends.map((e) => `${e.from} → ${e.error ? `error (${e.error.slice(0, 40)})` : `${e.to} (${e.status})`}`).join("; "),
      fix: `In your host's domain settings, add both ${bare} and www.${bare}, and redirect one to the other permanently (most hosts have a "redirect to" option)`,
    })];
  },
};
