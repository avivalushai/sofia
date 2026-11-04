import { createHash } from "node:crypto";
import { DomUtils } from "htmlparser2";
import { all, attr, first, meta, parseHtml, textOf, visibleSegments } from "./lib/html.js";

const PAGE_EXT = /(\/|\.html?|\.php|\.aspx?|\/[^./]+)$/i;

/**
 * @typedef Page
 * @property {string} url    final URL
 * @property {string} path   pathname + search, used in finding keys and locations
 * @property {number} status
 * @property {Record<string,string>} headers
 * @property {string} html
 * @property {any} doc       parsed DOM
 * @property {string[]} segments  visible text pieces
 * @property {string} text   visible text joined
 * @property {{ src: string|null, url: string|null, inline: string|null }[]} scripts
 */

/**
 * Plain-HTTP crawler (no JavaScript). Same origin only, breadth-first, deterministic order.
 * The browser layer (M2) adds a rendered crawl next to this one.
 * @param {{ target: string, http: ReturnType<import("./http.js").createHttp>, limit?: number }} opts
 */
export function createCrawler({ target, http, limit = 30 }) {
  let result;
  let rendered;
  let readSoFar = 0;
  /** @type {Map<string, { html: string, css: string[], media: string[] }>} each rendered page as the crawl read it */
  const snapshots = new Map();
  /** @type {((count: number) => void) | null} */
  let onRendered = null;
  let browser = null;
  const origin = new URL(target).origin;

  async function crawl() {
    /** @type {Page[]} */
    const pages = [];
    /** every URL visited, with its status: later used by broken-link checks */
    const visited = new Map();
    const bodies = new Set();
    const queue = [normalize(target)];
    const seen = new Set(queue);

    while (queue.length && pages.length < limit) {
      const batch = queue.splice(0, 6);
      const responses = await Promise.all(batch.map((u) => http.get(u).catch((err) => ({ error: err }))));
      batch.forEach((u, i) => {
        const res = responses[i];
        visited.set(u, res.error ? { error: res.error.message } : { status: res.status, url: res.url });
        if (res.error || res.status !== 200 || !/text\/html|application\/xhtml/.test(res.headers["content-type"] ?? "")) return;
        const hash = createHash("sha1").update(res.body).digest("hex");
        if (bodies.has(hash) || pages.length >= limit) return;
        bodies.add(hash);
        const page = toPage(res);
        pages.push(page);
        for (const a of all(page.doc, "a")) {
          const href = attr(a, "href");
          if (!href || /^(mailto|tel|javascript|data):/i.test(href)) continue;
          let next;
          try {
            next = normalize(new URL(href, page.url).href);
          } catch {
            continue;
          }
          if (new URL(next).origin !== origin || seen.has(next) || !PAGE_EXT.test(new URL(next).pathname)) continue;
          seen.add(next);
          queue.push(next);
        }
      });
    }
    return { pages, visited };
  }

  /** Breadth-first crawl in Chrome at desktop width: finds pages that only exist once JavaScript runs. */
  async function renderedCrawl() {
    const pages = [];
    snapshots.clear();
    const texts = new Set();
    const queue = [normalize(target)];
    const seen = new Set(queue);
    // two pages at a time (each is a Chrome tab); and a site full of near-identical links can't keep it going for ever
    let tries = limit * 3;
    while (queue.length && pages.length < limit && tries > 0) {
      const batch = queue.splice(0, Math.min(2, tries));
      tries -= batch.length;
      const opened = await Promise.all(batch.map(async (url) => {
        const reader = browser.lease();
        try {
          const p = await reader.open(url, { width: 1280, readOnly: true });
          if (p.status !== 200) return null;
          return await p.evaluate(() => ({
            text: window.__lc.visibleText(),
            links: [...document.querySelectorAll("a[href]")].map((a) => a.href),
            finalUrl: location.href,
            // what a site scan keeps of the page, so it needn't be loaded again for it
            html: document.documentElement.outerHTML,
            css: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href),
            media: [...document.querySelectorAll("img[src], a[href], source[src], video[src]")].map((el) => el.src || el.href),
          }));
        } catch {
          return null;
        } finally {
          reader.release();
        }
      }));
      for (const found of opened) {
        if (!found || pages.length >= limit) continue;
        const { text, links, finalUrl, html, css, media } = found;
        const fingerprint = createHash("sha1").update(text).digest("hex");
        if (texts.has(fingerprint)) continue;
        texts.add(fingerprint);
        const u = new URL(finalUrl);
        pages.push({ url: finalUrl, path: u.pathname + u.search, links });
        snapshots.set(finalUrl, { html: `<!DOCTYPE html>\n${html}`, css, media });
        for (const href of links) {
          let next;
          try {
            next = normalize(href);
          } catch {
            continue;
          }
          const nu = new URL(next);
          if (nu.origin !== origin || seen.has(next) || !/^https?:$/.test(nu.protocol) || !PAGE_EXT.test(nu.pathname)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      readSoFar = pages.length;
      onRendered?.(readSoFar);
    }
    return pages;
  }

  return {
    origin,
    limit,
    attachBrowser(b) {
      browser = b;
    },
    /**
     * Pages as Chrome renders them (url, path, links). Browser checks iterate these.
     * @returns {Promise<{ url: string, path: string, links: string[] }[]>}
     */
    /** @param {{ onPage?: (count: number) => void }} [o] told how many pages are read so far, whoever started the reading */
    async browserPages({ onPage } = {}) {
      if (!browser) throw new Error("browserPages() needs the browser (full mode)");
      if (onPage) {
        onRendered = onPage;
        onPage(readSoFar);
      }
      rendered ??= renderedCrawl();
      return rendered;
    },
    /** The page's markup, stylesheets and file links as the rendered crawl read them, or null. */
    snapshot: (url) => snapshots.get(url) ?? null,
    /** Rendered pages with their visible text, one line per block. */
    async browserPagesWithText() {
      const out = [];
      const reader = browser.lease();
      try {
        for (const p of await this.browserPages()) {
          const page = await reader.open(p.url, { width: 1280, readOnly: true });
          const text = await page.evaluate(() => (document.body?.innerText ?? "").split("\n").map((l) => l.trim()).filter(Boolean));
          out.push({ path: p.path, segments: text });
        }
      } finally {
        reader.release();
      }
      return out;
    },
    /** @returns {Promise<Page[]>} */
    async pages() {
      result ??= crawl();
      return (await result).pages;
    },
    async visited() {
      result ??= crawl();
      return (await result).visited;
    },
    /** Same-origin scripts on all pages (external files fetched once) plus inline scripts. */
    async scripts() {
      const pages = await this.pages();
      const out = [];
      const seenSrc = new Set();
      for (const p of pages) {
        for (const s of p.scripts) {
          if (s.inline != null) {
            if (s.inline.trim()) out.push({ where: p.path, url: p.url, code: s.inline });
            continue;
          }
          if (!s.url || new URL(s.url).origin !== origin || seenSrc.has(s.url)) continue;
          seenSrc.add(s.url);
          try {
            const res = await http.get(s.url);
            if (res.status === 200) out.push({ where: new URL(s.url).pathname, url: s.url, code: res.body });
          } catch {
            // unreachable scripts are the browser layer's business (qa.failed-requests)
          }
        }
      }
      return out;
    },
  };
}

function normalize(u) {
  const url = new URL(u);
  url.hash = "";
  return url.href;
}

function toPage(res) {
  const doc = parseHtml(res.body);
  const segments = visibleSegments(doc);
  const u = new URL(res.url);
  return {
    url: res.url,
    path: u.pathname + u.search,
    status: res.status,
    headers: res.headers,
    html: res.body,
    doc,
    segments,
    text: segments.join(" "),
    title: textOf(first(doc, "title")),
    lang: attr(first(doc, "html"), "lang") ?? null,
    meta: (k) => meta(doc, k),
    scripts: all(doc, "script")
      .filter((s) => !/json|template|text\/(?!javascript)/i.test(attr(s, "type") ?? ""))
      .map((s) => {
        const src = attr(s, "src") ?? null;
        let url = null;
        if (src) {
          try {
            url = new URL(src, res.url).href;
          } catch {}
        }
        return { src, url, inline: src ? null : DomUtils.textContent(s) };
      }),
  };
}
