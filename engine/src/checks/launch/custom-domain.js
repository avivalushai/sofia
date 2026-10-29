const PLATFORM = /\.vercel\.app$|\.netlify\.app$|\.pages\.dev$|\.onrender\.com$|\.fly\.dev$|\.up\.railway\.app$|\.herokuapp\.com$|\.web\.app$|\.firebaseapp\.com$|\.github\.io$|\.wixsite\.com$|\.lovable\.app$|\.replit\.app$|\.repl\.co$|\.bolt\.new$|\.glitch\.me$|\.surge\.sh$|\.amplifyapp\.com$/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "launch.custom-domain",
  layer: "mechanical",
  async run(ctx) {
    if (ctx.isLocalTarget) return [ctx.skip("scanning a local address — check this on the live site")];
    if (!PLATFORM.test(ctx.targetUrl.hostname)) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "The site lives on the hosting company's address",
      impact: "An address like this looks temporary, so people trust it less, it's harder to remember, and if you ever change hosts every link and search ranking is lost",
      location: { url: "/" },
      evidence: `the site is served at ${ctx.targetUrl.hostname}`,
      fix: "Buy a domain (around 50–100 ₪ a year for .co.il or .com) and connect it in your host's domain settings; the host shows the exact DNS records to add",
    })];
  },
};
