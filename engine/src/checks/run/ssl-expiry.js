import tls from "node:tls";

const SOON_DAYS = 21;

/** @type {import("../../types.js").Check} */
export default {
  id: "run.ssl-expiry",
  layer: "mechanical",
  async run(ctx) {
    if (ctx.isLocalTarget || ctx.targetUrl.protocol !== "https:") return [ctx.skip("scanning a local address — the certificate belongs to the live site")];
    const cert = await new Promise((resolve) => {
      const s = tls.connect({ host: ctx.targetUrl.hostname, port: Number(ctx.targetUrl.port) || 443, servername: ctx.targetUrl.hostname, timeout: 8000 }, () => {
        resolve(s.getPeerCertificate());
        s.end();
      });
      s.on("error", () => resolve(null));
      s.on("timeout", () => (s.destroy(), resolve(null)));
    });
    if (!cert?.valid_to) return [ctx.uncertain({ key: "site", title: "Couldn't read the site's certificate", evidence: "the secure connection didn't open" })];
    const days = Math.floor((new Date(cert.valid_to) - ctx.now) / 86_400_000);
    // automatic renewal (Let's Encrypt, the host's own) renews about 30 days ahead: under 3 weeks means it's stuck
    if (days > SOON_DAYS) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: days < 0 ? "The site's security certificate has expired" : `The site's security certificate expires in ${days} days`,
      impact: "When it expires, browsers show a full-page \"Your connection is not private\" warning and almost everyone leaves",
      location: { url: "/" },
      evidence: `issued by ${cert.issuer?.O ?? "unknown"}, valid until ${new Date(cert.valid_to).toISOString().slice(0, 10)}`,
      fix: "Renew it now; if the host renews automatically, check why it hasn't (often the domain's DNS no longer points to the host), and turn on renewal alerts",
    })];
  },
};
