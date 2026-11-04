import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { PAGE_HELPERS } from "./lib/page-helpers.js";
import { blockerName } from "./lib/blocked.js";
import { onStop } from "./lib/stop.js";

const require = createRequire(import.meta.url);

export class BrowserMissing extends Error {}

const HEIGHTS = { 375: 812, 390: 844, 768: 1024, 1280: 800 };
const SETTLE_MS = 400;
const READ_ONLY_IDLE_MS = 1000;
const NAV_TIMEOUT = 30_000;

/**
 * Chrome pages open at once, counting every kind (shared, isolated, throttled). Each one is a tab at
 * 20–40% of a core while it lives, and dozens of them froze a Mac: two is the ceiling. Fewer means the
 * same results, just slower. LC_MAX_PAGES overrides it.
 */
export const PAGE_LIMIT = Math.max(1, Number(process.env.LC_MAX_PAGES) || 2);
/** Only reading a page (its text, links and markup) needs none of these: they're blocked there. */
const READ_ONLY_BLOCKED = new Set(["image", "font", "media"]);

/**
 * The user's installed Chrome, driven by playwright-core. Never downloads a browser.
 * - open(url, { width })  → a shared, already-loaded page for read-only checks (cached per url+width)
 * - fresh(url, { width }, fn) → an isolated page for checks that click or type; closed afterwards
 */
export async function launchBrowser({ maxOpen = PAGE_LIMIT } = {}) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new BrowserMissing("playwright-core isn't installed. Run npm install in the plugin's engine folder.");
  }
  let browser;
  try {
    // headless: no window, no tabs on screen. Playwright closes it on Ctrl-C, kill or a closed terminal,
    // for any process; the command line also runs its own cleanup (lib/stop.js).
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch (err) {
    throw new BrowserMissing(
      "Sofia uses your installed Google Chrome and couldn't start it. " +
      "Install Chrome from https://www.google.com/chrome and run the scan again." +
      (process.env.LAUNCH_CHECK_DEBUG ? `\n${err.message}` : ""),
    );
  }

  const forget = onStop(() => browser.close());
  let axeSource;
  try {
    axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  } catch (err) {
    forget();
    await browser.close().catch(() => {});
    throw err;
  }
  const cache = new Map(); // key → Promise<LoadedPage>, in least-recently-used order
  /** key → how many checks are using that page right now; those are never closed under them */
  const holds = new Map();
  /** keys whose page has loaded (or failed): only those can be closed to make room */
  const settled = new Set();
  /** URLs the host's bot protection challenged, across every page loaded this run */
  const blocked = new Map();

  // a slot per open context (each holds one page). Pages that wait for one queue up; when a slot
  // comes free, the page the most checks are waiting for loads next, so they all read one load.
  let used = 0;
  /** @type {{ demand: () => number, start: () => void }[]} */
  const waiting = [];
  let loads = 0;
  const freeSlot = () => {
    if (!waiting.length) return void used--;
    let best = 0;
    for (let i = 1; i < waiting.length; i++) if (waiting[i].demand() > waiting[best].demand()) best = i;
    waiting.splice(best, 1)[0].start(); // the slot passes straight on
  };
  async function slot(demand) {
    if (used < maxOpen && !waiting.length) return void used++;
    const ready = new Promise((start) => waiting.push({ demand, start }));
    trim(); // idle shared pages make way
    await ready;
  }

  /**
   * A browser context of its own, counted against maxOpen: idle shared pages make way first.
   * @param {number} width @param {object} [extra] @param {() => number} [demand] how many are waiting for it
   */
  async function newContext(width, extra = {}, demand = () => 1) {
    await slot(demand);
    let context;
    try {
      context = await browser.newContext({
      viewport: { width, height: HEIGHTS[width] ?? 900 },
      deviceScaleFactor: 1,
      isMobile: width < 768,
      hasTouch: width < 768,
      locale: "en-US",
      serviceWorkers: "block",
      ...extra,
    });
    } catch (err) {
      freeSlot();
      throw err;
    }
    context.once("close", freeSlot);
    return context;
  }

  /** Loads a URL and records everything a check might ask about afterwards. */
  async function load(context, url, { beforeGoto, waitUntil = "load", idle = true, settleMs = SETTLE_MS, readOnly = false } = {}) {
    loads++;
    const page = await context.newPage();
    const log = { console: [], pageErrors: [], requests: [], failed: [], responses: new Map(), blocked: new Set(), pageBlocked: false };
    // requests this scan chose not to load: they didn't fail, so they aren't logged as failed
    const skipped = new WeakSet();
    if (readOnly) {
      await page.route("**/*", (r) => {
        if (!READ_ONLY_BLOCKED.has(r.request().resourceType())) return r.continue();
        skipped.add(r.request());
        return r.abort("blockedbyclient");
      });
    }
    page.on("console", (m) => m.type() === "error" && log.console.push({ text: m.text(), url: m.location()?.url ?? null }));
    page.on("pageerror", (e) => log.pageErrors.push({ text: `${e.name}: ${e.message}` }));
    page.on("request", (r) => log.requests.push({ url: r.url(), method: r.method(), type: r.resourceType() }));
    page.on("requestfailed", (r) => !skipped.has(r) && log.failed.push({ url: r.url(), method: r.method(), type: r.resourceType(), error: r.failure()?.errorText ?? "failed" }));
    page.on("response", (r) => {
      log.responses.set(r.url(), r.status());
      const h = r.headers();
      if (h["x-vercel-mitigated"] === "challenge" || h["cf-mitigated"] === "challenge" || h["x-launch-check-unavailable"]) {
        log.blocked.add(r.url());
        blocked.set(r.url(), blockerName(h));
        if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) log.pageBlocked = true;
      }
    });
    await page.addInitScript(PAGE_HELPERS);
    if (beforeGoto) await beforeGoto(page);
    let status = null;
    try {
      const res = await page.goto(url, { waitUntil, timeout: NAV_TIMEOUT });
      status = res?.status() ?? null;
    } catch (err) {
      await page.close().catch(() => {});
      const e = new Error(`Couldn't load ${url} in Chrome (${err.message.split("\n")[0]})`);
      e.code = "ETIMEOUT";
      throw e;
    }
    // sites with chat widgets or analytics never go quiet; a page read for its text and links waits less for it
    if (idle) await page.waitForLoadState("networkidle", { timeout: readOnly ? READ_ONLY_IDLE_MS : 3000 }).catch(() => {});
    await page.waitForTimeout(settleMs);
    return wrap(page, log, status);
  }

  function wrap(page, log, status) {
    // checks share pages; anything that changes what's on screen (highlights, axe) takes turns
    let queue = Promise.resolve();
    const exclusive = (fn) => {
      const run = queue.then(fn);
      queue = run.catch(() => {});
      return run;
    };
    return {
      page,
      status,
      url: page.url(),
      log,
      evaluate: (fn, arg) => page.evaluate(fn, arg),
      /** Injects axe-core once and runs the given rules. axe allows one run at a time per page, so runs queue up. */
      axe(rules) {
        return exclusive(async () => {
          if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ content: axeSource });
          return page.evaluate(
            (only) => window.axe.run(document, { runOnly: { type: "rule", values: only }, resultTypes: ["violations"] }),
            rules,
          );
        });
      },
      /**
       * Viewport screenshot with the element outlined in red and scrolled into view.
       * @returns {Promise<Buffer>}
       */
      screenshot({ highlight = null } = {}) {
        return exclusive(async () => {
          if (highlight) await page.evaluate((sel) => window.__lc.highlight(sel), highlight).catch(() => {});
          const buf = await page.screenshot({ type: "png" });
          if (highlight) await page.evaluate(() => window.__lc.unhighlight()).catch(() => {});
          return buf;
        });
      },
      /** Real font used to draw an element's text (Chrome DevTools protocol). */
      async platformFonts(selector) {
        const cdp = await page.context().newCDPSession(page);
        try {
          await cdp.send("DOM.enable");
          await cdp.send("CSS.enable");
          const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
          const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
          if (!nodeId) return [];
          return (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })).fonts;
        } finally {
          await cdp.detach().catch(() => {});
        }
      },
    };
  }

  /**
   * Closes the least recently used shared pages nobody is using: enough to stay within maxOpen, or
   * `atLeast` of them to make room for another page, and one for each page waiting for room.
   * @returns {number} how many it closed
   */
  function trim(atLeast = 0) {
    atLeast = Math.max(atLeast, waiting.length);
    let closed = 0;
    for (const [key, loaded] of cache) {
      if (closed >= atLeast && cache.size <= maxOpen) break;
      // a page still waiting for its slot holds none, so closing it makes no room
      if (holds.has(key) || !settled.has(key)) continue;
      cache.delete(key);
      settled.delete(key);
      closed++;
      loaded.then((p) => p.page.context().close()).catch(() => {});
    }
    return closed;
  }

  function get(url, { width, readOnly = false }) {
    const key = `${readOnly ? "read " : ""}${width} ${url}`;
    if (cache.has(key)) {
      const hit = cache.get(key);
      cache.delete(key);
      cache.set(key, hit);
      return { key, loaded: hit };
    }
    const loaded = (async () => {
      const context = await newContext(width, {}, () => holds.get(key) ?? 0);
      try {
        return await load(context, url, { readOnly });
      } catch (err) {
        await context.close().catch(() => {});
        throw err;
      }
    })();
    cache.set(key, loaded);
    loaded.then(() => settled.add(key), () => cache.delete(key));
    return { key, loaded };
  }

  /**
   * One user of shared pages (a check, or the crawl): it holds the last page it opened until it opens
   * the next one or lets go, so a page is never closed while it's being read.
   */
  function lease() {
    let held = null;
    let waited = 0;
    const letGo = (key) => {
      const n = holds.get(key) - 1;
      if (n) holds.set(key, n);
      else holds.delete(key);
    };
    return {
      /**
       * Shared page for read-only checks. Don't click or type on it — use fresh() for that.
       * readOnly: images, fonts and media aren't loaded, for reading text, links and markup only.
       * @param {string} url
       * @param {{ width: number, readOnly?: boolean }} o
       */
      open(url, o) {
        const { key, loaded } = get(url, o);
        holds.set(key, (holds.get(key) ?? 0) + 1);
        if (held) letGo(held);
        held = key;
        trim();
        const since = Date.now();
        return loaded.finally(() => (waited += Date.now() - since));
      },
      /** Time spent waiting for pages (their turn and their loading), in ms. */
      waited: () => waited,
      release() {
        if (held) letGo(held);
        held = null;
        trim();
      },
    };
  }
  return {
    version: browser.version(),
    blocked,
    /** Shared, already-loaded pages: lease().open(url, { width }), then release() when done. */
    lease,
    /** How many pages were loaded so far. */
    stats: () => ({ loads }),

    /**
     * An isolated page for interactive checks. Closed when fn returns.
     * @template T
     * @param {string} url
     * @param {{ width: number, beforeGoto?: (page: any) => Promise<void>, context?: object, waitUntil?: string, idle?: boolean, settleMs?: number }} o
     * @param {(p: ReturnType<typeof wrap>) => Promise<T>} fn
     * @returns {Promise<T>}
     */
    async fresh(url, { width, beforeGoto, context: extra, waitUntil, idle, settleMs }, fn) {
      const context = await newContext(width, extra);
      try {
        const p = await load(context, url, { beforeGoto, waitUntil, idle, settleMs });
        return await fn(p);
      } finally {
        await context.close().catch(() => {});
      }
    },

    /** A raw context for checks that measure performance with throttling. */
    newContext,

    async close() {
      forget();
      await browser.close().catch(() => {});
    },
  };
}
