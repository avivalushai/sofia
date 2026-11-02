import { dns } from "./context.js";
import { PLATFORM_HOST, registrableDomain } from "./lib/net.js";

/**
 * What a scan from a web address alone can and can't do. Everything else in the catalog stays in the
 * report as skipped, with the reason, so nobody takes a partial scan for a full one.
 */

/** Checks that click, submit or sign in: they change things on a live site. */
const ACTIVE = new Set([
  "qa.dead-buttons", "forms.destination", "forms.success-truth", "forms.validation", "forms.thank-you",
  "sec.idor", "sec.open-db", "sec.cookies", "analytics.double-fire", "data.local-only",
  "behave.double-submit", "behave.extreme-input", "ai.prompt-injection",
]);
/** Checks that look for weak spots: only on a site its owner has proved is theirs. */
const PROBES = new Set(["sec.env-files", "sec.exposed-paths"]);
/** Checks that only the site's code or hosting can answer. */
export const NEEDS_CODE = new Set([
  "qa.error-boundary", "qa.orphan-pages", "design.ui-libraries", "design.icon-sets", "forms.backup",
  "sec.repo-secrets", "sec.debug-logs", "mail.real-sender", "mail.reply-to", "mail.unsubscribe",
  "privacy.session-replay", "analytics.internal", "launch.staging-noindex", "launch.redirects-old",
  "shop.invoices", "shop.israeli-payment", "leftover.duplicate-files", "leftover.dead-code",
  "env.missing-vars", "ai.limits", "deps.vulnerable", "deps.heavy",
]);
export const NO_CODE_REASON = "needs the site's code, which this scan doesn't have";

/** Answered from plain requests, with no Chrome and no page's code: these report first. */
const EARLY = new Set([
  "launch.https-redirect", "launch.ssl-valid", "launch.canonical-host", "launch.dns", "launch.custom-domain",
  "run.ssl-expiry", "run.domain-expiry", "sec.headers", "sec.source-maps", "sec.cors",
  "seo.title", "seo.description", "seo.share-tags", "seo.share-image", "seo.single-h1", "seo.robots", "seo.noindex", "seo.sitemap", "seo.canonical", "seo.ssr",
  "agent.semantic", "agent.schema", "agent.llms-txt", "agent.crawler-policy", "a11y.lang", "a11y.zoom", "resp.viewport", "design.favicon", "perf.cache",
]);
export const runsEarly = (c) => EARLY.has(c.id);

/** Why a check isn't part of a scan from a web address; null when it is. */
export function siteScanSkip(entry) {
  if (entry.layer === "judgment") return "needs a reviewer to read the site's code and pages";
  if (ACTIVE.has(entry.id)) return "clicks or sends things, so it never runs on a live site from this scan";
  if (PROBES.has(entry.id)) return "looks for weak spots, so it only runs on a site you've proved is yours";
  if (NEEDS_CODE.has(entry.id)) return NO_CODE_REASON;
  return null;
}

/**
 * Without code, the only sign a domain uses email is that it can receive it. A host's own address
 * doesn't count: its email records belong to the host.
 */
export async function mailFact(hostname) {
  const no = { value: false, why: "this domain has no email set up" };
  if (PLATFORM_HOST.test(hostname)) return no;
  const domain = registrableDomain(hostname);
  const mx = await dns.mx(domain).catch(() => []);
  return mx.length ? { value: true, why: `${domain} has email set up` } : no;
}

const MEDIA_SKIP = /^\/(_next|_astro|_nuxt)\//;

/**
 * Stands in for the source: each page as Chrome rendered it, its own stylesheets and the names of its
 * images and files. Checks read them like project files. Scripts stay out, because a bundle is full of
 * library code that would read as the site's own.
 * @returns {Promise<Map<string, string>>} virtual file → the address it came from
 */
export async function addSiteFiles({ project, crawl, browser, http, origin, onPage }) {
  const sources = new Map();
  const css = new Set();
  const media = new Set();
  const reader = browser.lease();
  try {
    for (const p of await crawl.browserPages({ onPage })) {
      let loaded;
      try {
        loaded = await reader.open(p.url, { width: 1280, readOnly: true });
      } catch {
        continue; // a page that won't load is qa.failed-requests' business
      }
      const pathname = p.path.split("?")[0];
      const name = pathname === "/" ? "index.html" : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : /\.html?$/.test(pathname) ? pathname.slice(1) : `${pathname.slice(1)}.html`;
      if (!sources.has(name)) {
        project.addFile(name, await loaded.page.content());
        sources.set(name, p.path);
      }
      const found = await loaded.evaluate(() => ({
        css: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href),
        media: [...document.querySelectorAll("img[src], a[href], source[src], video[src]")].map((el) => el.src || el.href),
      }));
      for (const u of found.css) css.add(u);
      for (const u of found.media) media.add(u);
    }
  } finally {
    reader.release();
  }
  for (const u of css) {
    if (new URL(u).origin !== origin) continue;
    const res = await http.get(u, { as: "none" }).catch(() => null);
    const name = new URL(u).pathname.slice(1);
    if (res?.status !== 200 || sources.has(name)) continue;
    project.addFile(name, String(res.body));
    sources.set(name, `/${name}`);
  }
  for (const u of media) {
    const url = new URL(u);
    if (url.origin !== origin || MEDIA_SKIP.test(url.pathname)) continue;
    const name = decodeURIComponent(url.pathname).slice(1);
    if (!name || sources.has(name)) continue;
    project.addFile(name, null);
    sources.set(name, url.pathname);
  }
  return sources;
}

/** The virtual files aren't the site's real files: a finding points at the address instead. */
export function toAddresses(results, sources) {
  for (const r of results) {
    for (const item of r.items) {
      const file = item.location?.file;
      if (file == null) continue;
      const { file: _file, line: _line, ...rest } = item.location;
      item.location = { ...rest, url: rest.url ?? sources.get(file) };
    }
  }
}
