/** @type {import("../../types.js").Check} */
export default {
  id: "launch.https-redirect",
  layer: "mechanical",
  async run(ctx) {
    if (ctx.isLocalTarget) return [ctx.skip("scanning a local address — secure connections are set up by your host when you go live")];
    const http = new URL(ctx.target);
    http.protocol = "http:";
    http.port = "";
    let res;
    try {
      res = await ctx.http.request(http.href, { as: "none", follow: false });
    } catch {
      return [ctx.uncertain({
        key: "site",
        title: "Couldn't check the insecure address",
        evidence: `${http.href} didn't answer`,
        fix: "",
      })];
    }
    const location = res.headers.location ? new URL(res.headers.location, http.href) : null;
    if (res.status >= 300 && res.status < 400 && location?.protocol === "https:") return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "The site still opens without a secure connection",
      impact: "People who type the address without https get a page marked \"Not secure\", and anything they type can be read on public Wi-Fi",
      location: { url: "/" },
      evidence: `${http.href} returned ${res.status}${location ? ` → ${location.href}` : ""} instead of redirecting to https`,
      fix: "Turn on \"redirect HTTP to HTTPS\" in your host settings, or add a permanent redirect rule",
    })];
  },
};
