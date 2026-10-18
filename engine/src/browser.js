import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { PAGE_HELPERS } from "./lib/page-helpers.js";

const require = createRequire(import.meta.url);

export class BrowserMissing extends Error {}

const HEIGHTS = { 375: 812, 390: 844, 768: 1024, 1280: 800 };
const SETTLE_MS = 400;
const NAV_TIMEOUT = 30_000;

/**
 * The user's installed Chrome, driven by playwright-core. Never downloads a browser.
 * - open(url, { width })  → a shared, already-loaded page for read-only checks (cached per url+width)
 * - fresh(url, { width }, fn) → an isolated page for checks that click or type; closed afterwards
 */
export async function launchBrowser({ maxOpen = 10 } = {}) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new BrowserMissing("playwright-core isn't installed. Run npm install in the plugin's engine folder.");
  }
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch (err) {
    throw new BrowserMissing(
      "Launch Check uses your installed Google Chrome and couldn't start it. " +
      "Install Chrome from https://www.google.com/chrome and run the scan again." +
      (process.env.LAUNCH_CHECK_DEBUG ? `\n${err.message}` : ""),
    );
  }

  const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  const cache = new Map(); // key → Promise<LoadedPage>, in least-recently-used order

  async function newContext(width, extra = {}) {
    return browser.newContext({
      viewport: { width, height: HEIGHTS[width] ?? 900 },
      deviceScaleFactor: 1,
      isMobile: width < 768,
      hasTouch: width < 768,
      locale: "en-US",
      serviceWorkers: "block",
      ...extra,
    });
  }

  /** Loads a URL and records everything a check might ask about afterwards. */
  async function load(context, url, { beforeGoto, waitUntil = "load", idle = true, settleMs = SETTLE_MS } = {}) {
    const page = await context.newPage();
    const log = { console: [], pageErrors: [], requests: [], failed: [], responses: new Map() };
    page.on("console", (m) => m.type() === "error" && log.console.push({ text: m.text(), url: m.location()?.url ?? null }));
    page.on("pageerror", (e) => log.pageErrors.push({ text: `${e.name}: ${e.message}` }));
    page.on("request", (r) => log.requests.push({ url: r.url(), method: r.method(), type: r.resourceType() }));
    page.on("requestfailed", (r) => log.failed.push({ url: r.url(), method: r.method(), type: r.resourceType(), error: r.failure()?.errorText ?? "failed" }));
    page.on("response", (r) => log.responses.set(r.url(), r.status()));
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
    if (idle) await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
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

  return {
    version: browser.version(),
    /**
     * Shared page for read-only checks. Don't click or type on it — use fresh() for that.
     * @param {string} url
     * @param {{ width: number }} o
     */
    async open(url, { width }) {
      const key = `${width} ${url}`;
      if (cache.has(key)) {
        const hit = cache.get(key);
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const loaded = (async () => {
        const context = await newContext(width);
        try {
          return await load(context, url);
        } catch (err) {
          await context.close().catch(() => {});
          throw err;
        }
      })();
      cache.set(key, loaded);
      loaded.catch(() => cache.delete(key));
      while (cache.size > maxOpen) {
        const [oldKey, old] = cache.entries().next().value;
        cache.delete(oldKey);
        old.then((p) => p.page.context().close()).catch(() => {});
      }
      return loaded;
    },

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
      await browser.close().catch(() => {});
    },
  };
}
