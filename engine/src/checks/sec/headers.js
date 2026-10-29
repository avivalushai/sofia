import { headerConfigs, usesHelmet } from "../../lib/host-config.js";

/**
 * The three headers worth asking a non-developer for. A full content policy is not required here: it
 * breaks sites easily and is a project of its own.
 */
const WANTED = [
  {
    name: "clickjacking",
    has: (h) => Boolean(h["x-frame-options"]) || /frame-ancestors/i.test(h["content-security-policy"] ?? ""),
    inConfig: /x-frame-options|frame-ancestors|frameguard/i,
    plain: "other sites can show your pages inside theirs, under a fake button, and trick visitors into clicking",
    header: "X-Frame-Options: DENY (or CSP frame-ancestors)",
  },
  {
    name: "nosniff",
    has: (h) => /nosniff/i.test(h["x-content-type-options"] ?? ""),
    inConfig: /x-content-type-options|nosniff/i,
    plain: "an uploaded file can be run as code by the browser",
    header: "X-Content-Type-Options: nosniff",
  },
  {
    name: "hsts",
    // the host adds it on most platforms; only a live https site can tell
    liveOnly: true,
    has: (h) => /max-age=\d+/i.test(h["strict-transport-security"] ?? ""),
    inConfig: /strict-transport-security|hsts/i,
    plain: "browsers may open the insecure version of your site first, where traffic can be read on public Wi-Fi",
    header: "Strict-Transport-Security: max-age=31536000",
  },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.headers",
  layer: "mechanical",
  async run(ctx) {
    if (!ctx.isLocalTarget) {
      const res = await ctx.http.get(ctx.target);
      if (res.blocked) return [ctx.uncertain({ key: "site", title: "Couldn't read the site's headers", evidence: "the host's bot protection answered instead of the site" })];
      const missing = WANTED.filter((w) => !(w.liveOnly && ctx.targetUrl.protocol !== "https:") && !w.has(res.headers));
      return missing.length ? [fail(ctx, missing, `the home page is served without: ${missing.map((m) => m.header).join("; ")}`)] : [ctx.pass()];
    }
    // a local server doesn't send the live headers: read the files that tell the host what to send
    if (usesHelmet(ctx.project)) return [ctx.pass()];
    const configs = await headerConfigs(ctx.project);
    const wanted = WANTED.filter((w) => !w.liveOnly);
    if (!configs.length) {
      return [ctx.uncertain({
        key: "site",
        title: "Couldn't tell whether your site sends security headers",
        evidence: "this is a local copy and no host settings file (vercel.json, netlify.toml, _headers, next.config…) sets headers — your host may still add them. Scan the live site to know for sure",
      })];
    }
    const all = configs.map((c) => c.text).join("\n");
    const missing = wanted.filter((w) => !w.inConfig.test(all));
    return missing.length ? [fail(ctx, missing, `${configs.length === 1 ? `${configs[0].file} doesn't set` : `none of ${configs.map((c) => c.file).join(", ")} sets`} ${missing.map((m) => m.header).join("; ")}`, configs[0].file)] : [ctx.pass()];
  },
};

function fail(ctx, missing, evidence, file = null) {
  return ctx.fail({
    key: "site",
    title: missing.length === 1 ? "A basic browser protection is switched off" : `${missing.length} basic browser protections are switched off`,
    impact: `Without them, ${missing.map((m) => m.plain).join("; and ")}`,
    location: file ? { file } : { url: "/" },
    evidence,
    fix: `Add these response headers in your host settings: ${missing.map((m) => m.header).join(", ")}`,
  });
}
