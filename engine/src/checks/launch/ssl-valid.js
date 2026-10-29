import { connect } from "node:tls";

const DAY = 24 * 60 * 60 * 1000;
const WARN_DAYS = 14;

/** @returns {Promise<{ authorized: boolean, error: string|null, validTo: Date|null }>} */
function inspect(hostname, port) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: 10_000 }, () => {
      const cert = socket.getPeerCertificate();
      resolve({ authorized: socket.authorized, error: socket.authorizationError ? String(socket.authorizationError) : null, validTo: cert?.valid_to ? new Date(cert.valid_to) : null });
      socket.end();
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(Object.assign(new Error("TLS timeout"), { code: "ETIMEOUT" }));
    });
    socket.on("error", reject);
  });
}

const PLAIN = {
  CERT_HAS_EXPIRED: "the certificate has expired",
  DEPTH_ZERO_SELF_SIGNED_CERT: "the certificate is self-signed",
  SELF_SIGNED_CERT_IN_CHAIN: "the certificate is self-signed",
  ERR_TLS_CERT_ALTNAME_INVALID: "the certificate is for a different address",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "the certificate chain is incomplete",
};

/** @type {import("../../types.js").Check} */
export default {
  id: "launch.ssl-valid",
  layer: "mechanical",
  async run(ctx) {
    if (ctx.isLocalTarget) return [ctx.skip("scanning a local address — certificates are set up by your host when you go live")];
    const { hostname } = ctx.targetUrl;
    const port = ctx.targetUrl.protocol === "https:" ? Number(ctx.targetUrl.port || 443) : 443;
    let info;
    try {
      info = await inspect(hostname, port);
    } catch (e) {
      if (e.code === "ECONNREFUSED" && ctx.targetUrl.protocol === "http:") {
        return [ctx.fail({
          key: "site",
          title: "The site has no secure connection at all",
          impact: "Browsers mark every page \"Not secure\", and anything visitors type can be read on public Wi-Fi",
          location: { url: "/" },
          evidence: `${hostname} doesn't accept https connections`,
          fix: "1. In your host's dashboard, open the domain settings. 2. Turn on HTTPS / SSL (it's free on Vercel, Netlify and Cloudflare). 3. Tell me when it's done and I'll re-check.",
        })];
      }
      throw e;
    }
    const daysLeft = info.validTo ? Math.floor((info.validTo.getTime() - ctx.now.getTime()) / DAY) : null;
    if (!info.authorized) {
      return [ctx.fail({
        key: "site",
        title: "Browsers show a security warning instead of the site",
        impact: "Visitors see a full-page \"Your connection is not private\" warning, and almost all of them leave",
        location: { url: "/" },
        evidence: `${PLAIN[info.error] ?? info.error}${info.error && PLAIN[info.error] ? ` (${info.error})` : ""}`,
        fix: "1. In your host's dashboard, open the domain settings. 2. Check the domain shows as verified and the certificate as active — re-issue it if offered. 3. Tell me when it's done and I'll re-check.",
      })];
    }
    if (daysLeft != null && daysLeft < WARN_DAYS) {
      return [ctx.fail({
        key: "site",
        title: "The security certificate is about to expire",
        impact: "When it expires, visitors get a full-page security warning instead of the site",
        location: { url: "/" },
        evidence: `Certificate expires in ${daysLeft} days (${info.validTo.toISOString().slice(0, 10)}); automatic renewal usually happens a month ahead`,
        fix: "1. In your host's dashboard, open the domain settings. 2. Check why the certificate hasn't renewed — often the domain's DNS no longer points to the host. 3. Tell me when it's done and I'll re-check.",
      })];
    }
    return [ctx.pass()];
  },
};
