import { registrableDomain } from "../../lib/net.js";

const SOON_DAYS = 45;

/** @type {import("../../types.js").Check} */
export default {
  id: "run.domain-expiry",
  layer: "mechanical",
  async run(ctx) {
    if (ctx.isLocalTarget) return [ctx.skip("scanning a local address — domain renewal belongs to the live domain")];
    const domain = registrableDomain(ctx.targetUrl.hostname);
    // RDAP: the registries' public, free lookup (the successor of WHOIS)
    const res = await ctx.http.get(`https://rdap.org/domain/${domain}`).catch(() => null);
    let data = null;
    try {
      data = res?.status === 200 ? JSON.parse(res.body) : null;
    } catch {}
    const exp = data?.events?.find((e) => e.eventAction === "expiration")?.eventDate;
    if (!exp) {
      return [ctx.uncertain({
        key: "site",
        title: "Couldn't read when the domain expires",
        evidence: `${domain}: the registry ${res ? "doesn't publish the date" : "didn't answer"} (.il domains aren't in the public lookup)`,
        fix: "Log in to where you bought the domain, check the expiry date, and turn on auto-renew with a card that won't expire before then",
      })];
    }
    const days = Math.floor((new Date(exp) - ctx.now) / 86_400_000);
    if (days > SOON_DAYS) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: days < 0 ? "The domain has expired" : `The domain expires in ${days} days`,
      impact: "If it lapses, the site and every email address on it stop working, and someone else can buy the name",
      location: { url: "/" },
      evidence: `${domain} expires on ${exp.slice(0, 10)}`,
      fix: "Renew it now and turn on auto-renew at the registrar, with a card that won't expire first",
    })];
  },
};
