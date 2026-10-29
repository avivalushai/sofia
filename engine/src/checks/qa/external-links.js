import { all, attr } from "../../lib/html.js";
import { isLocalHost } from "../../lib/net.js";

const MAX_LINKS = 40;
// social sites and some others answer bots with an error even when the page is fine
const BOT_HOSTILE = /(^|\.)(linkedin\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|tiktok\.com|wa\.me|whatsapp\.com|medium\.com|amazon\.[a-z.]+|glassdoor\.com|indeed\.com|quora\.com)$/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.external-links",
  layer: "browser",
  async run(ctx) {
    const links = new Map();
    for (const page of await ctx.crawl.pages()) {
      for (const a of all(page.doc, "a")) {
        let u;
        try {
          u = new URL(attr(a, "href") ?? "", page.url);
        } catch {
          continue;
        }
        if (!/^https?:$/.test(u.protocol) || u.origin === ctx.targetUrl.origin || isLocalHost(u.hostname)) continue;
        u.hash = "";
        if (!links.has(u.href)) links.set(u.href, page.path);
      }
    }
    if (!links.size) return [ctx.pass()];
    const dead = [];
    const unsure = [];
    let answered = 0;
    for (const [href, from] of [...links].slice(0, MAX_LINKS)) {
      await new Promise((r) => setTimeout(r, 150));
      let res = await ctx.http.request(href, { method: "HEAD", as: "none" }).catch((e) => ({ error: e }));
      // some servers don't answer HEAD properly: ask again with GET before deciding
      if (res.error || res.status === 405 || res.status === 404 || res.status >= 500) res = await ctx.http.request(href, { as: "none" }).catch((e) => ({ error: e }));
      const host = new URL(href).hostname;
      if (res.error) {
        const code = res.error.cause?.code ?? res.error.code ?? "";
        if (/ENOTFOUND|EAI_AGAIN/.test(`${code} ${res.error.message}`)) dead.push({ href, from, why: "the domain doesn't exist" });
        else unsure.push({ href, from, why: res.error.message?.slice(0, 40) ?? "no answer" });
        continue;
      }
      answered++;
      if (res.status === 404 || res.status === 410) dead.push({ href, from, why: `answers ${res.status}` });
      else if (res.status >= 400 && !BOT_HOSTILE.test(host) && res.status !== 403 && res.status !== 429 && res.status !== 999) unsure.push({ href, from, why: `answers ${res.status}` });
    }
    // nothing answered at all: make sure this machine is online before calling the links dead
    if (!answered && dead.length) {
      const online = await ctx.dns.a("one.one.one.one").then((a) => a.length > 0, () => false);
      if (!online) return [ctx.uncertain({ key: "site", title: "Couldn't check the links to other sites", evidence: "none of them answered, and this machine seems to be offline" })];
    }
    const results = [];
    if (dead.length) {
      results.push(ctx.fail({
        key: "site",
        title: dead.length === 1 ? "A link to another site is dead" : `${dead.length} links to other sites are dead`,
        impact: "Visitors who click land on an error page, which makes the site look abandoned",
        location: { url: dead[0].from },
        evidence: dead.slice(0, 5).map((d) => `${d.href} on ${d.from} (${d.why})`).join("; ") + (dead.length > 5 ? `; and ${dead.length - 5} more` : ""),
        fix: "Update each link to the page's current address, or remove it",
      }));
    }
    if (unsure.length) {
      results.push(ctx.uncertain({
        key: "unsure",
        title: unsure.length === 1 ? "Couldn't tell if a link to another site works" : `Couldn't tell if ${unsure.length} links to other sites work`,
        evidence: unsure.slice(0, 5).map((d) => `${d.href} (${d.why})`).join("; "),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
