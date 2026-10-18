/** Shared pieces for browser-layer checks. */

export const SUCCESS_WORDS = /thank|success|received|we'?ll be in touch|you'?re (in|on the list)|sent!|submitted|תודה|נשלח|התקבל|קיבלנו|נחזור|נרשמת|בהצלחה/i;
export const ERROR_WORDS = /error|wrong|failed|couldn'?t|could not|unable|try again|invalid|required|please (enter|fill|provide)|שגיאה|נסה שוב|נסו שוב|לא הצלחנו|משהו השתבש|חובה|לא תקין|שדה/i;
export const ANALYTICS_HOSTS = /google-analytics\.com|googletagmanager\.com|analytics\.google\.com|connect\.facebook\.net|facebook\.com\/tr|static\.hotjar\.com|script\.hotjar\.com|clarity\.ms|analytics\.tiktok\.com|snap\.licdn\.com|px\.ads\.linkedin\.com|cdn\.segment\.com|api\.segment\.io|cdn\.mxpnl\.com|api-js\.mixpanel\.com|js\.hs-scripts\.com|js\.hs-analytics\.net|static\.ads-twitter\.com|bat\.bing\.com|cdn\.amplitude\.com|us\.i\.posthog\.com|eu\.i\.posthog\.com|app\.posthog\.com/;
/** analytics that don't set cookies or track people, so they don't need consent */
export const COOKIELESS = /plausible\.io|usefathom\.com|cdn\.usefathom|umami|simpleanalytics|va\.vercel-scripts\.com|vitals\.vercel-insights/;

/** Test values for each kind of field — the same every run. */
const VALUES = {
  email: "launch-check-test@example.com",
  tel: "0500000000",
  url: "https://example.com",
  number: "1",
  date: "2030-01-01",
  password: "LaunchCheck-test-1",
  text: "Launch Check test",
  textarea: "Test message from Launch Check. Please ignore.",
};

/**
 * Forms worth testing: visible, with at least one field a person types into, de-duplicated across
 * pages (a footer newsletter form on every page is tested once).
 * @returns {Promise<{ url: string, path: string, selector: string, fields: number, label: string }[]>}
 */
export async function findForms(ctx, limit = 5) {
  const forms = [];
  const seen = new Set();
  for (const page of await ctx.crawl.browserPages()) {
    const p = await ctx.browser.open(page.url, { width: 1280 });
    const found = await p.evaluate(() =>
      [...document.querySelectorAll("form")]
        .filter((f) => window.__lc.isVisible(f))
        .map((f) => {
          const fields = [...f.querySelectorAll("input, textarea, select")].filter((i) => !["hidden", "submit", "button", "reset", "image"].includes(i.type) && window.__lc.isVisible(i));
          return { selector: window.__lc.cssPath(f), fields: fields.length, signature: fields.map((i) => `${i.name || i.id || i.type}`).join(","), label: (f.querySelector("button, [type=submit]")?.textContent ?? "").trim().slice(0, 40) };
        })
        .filter((f) => f.fields > 0),
    );
    for (const f of found) {
      if (seen.has(f.signature)) continue;
      seen.add(f.signature);
      forms.push({ url: page.url, path: page.path, selector: f.selector, fields: f.fields, label: f.label });
      if (forms.length >= limit) return forms;
    }
  }
  return forms;
}

/** Fills every field of a form with plausible test values. */
export async function fillForm(page, formSelector, { valid = true } = {}) {
  await page.evaluate(
    ({ sel, values, valid }) => {
      const form = document.querySelector(sel);
      const set = (el, v) => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      for (const el of form.querySelectorAll("input, textarea, select")) {
        if (!window.__lc.isVisible(el) || el.disabled || el.readOnly) continue;
        const type = el.type;
        if (["hidden", "submit", "button", "reset", "image", "file"].includes(type)) continue;
        if (type === "checkbox" || type === "radio") {
          if (valid && (el.required || type === "checkbox") && !el.checked) el.click();
          continue;
        }
        if (el instanceof HTMLSelectElement) {
          const opt = [...el.options].find((o) => o.value && !o.disabled);
          if (opt && valid) set(el, opt.value);
          continue;
        }
        if (!valid) {
          set(el, type === "email" || /mail/i.test(el.name + el.id + el.placeholder) ? "not-an-email" : "");
          continue;
        }
        const guess = /mail/i.test(el.name + el.id + el.placeholder + el.autocomplete) ? "email"
          : /phone|tel|טלפון|נייד/i.test(el.name + el.id + el.placeholder) ? "tel"
          : el instanceof HTMLTextAreaElement ? "textarea" : type;
        set(el, values[guess] ?? values.text);
      }
    },
    { sel: formSelector, values: VALUES, valid },
  );
}

/** Clicks the form's submit button (or calls requestSubmit when there's none). */
export async function submitForm(page, formSelector) {
  const button = await page.$(`${formSelector} [type=submit], ${formSelector} button:not([type=button]):not([type=reset])`);
  if (button) await button.click({ timeout: 3000 }).catch(() => page.evaluate((s) => document.querySelector(s).requestSubmit(), formSelector));
  else await page.evaluate((s) => document.querySelector(s).requestSubmit(), formSelector);
}

/**
 * Intercepts every request that would change something (anything but GET/HEAD/OPTIONS),
 * records it and answers it ourselves, so nothing reaches a real server.
 * @param {"ok"|"fail"|"abort"} answer
 */
export async function interceptWrites(page, answer = "ok") {
  const writes = [];
  await page.route("**/*", (route) => {
    const req = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(req.method())) return route.continue();
    writes.push({ url: req.url(), method: req.method() });
    if (answer === "abort") return route.abort("connectionrefused");
    if (answer === "fail") return route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"blocked by Launch Check"}' });
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  return writes;
}

/** Text that became visible after an action: what's on screen now that wasn't before. */
export async function newVisibleText(page, before) {
  const now = await page.evaluate(() => window.__lc.visibleText());
  if (now === before) return "";
  // cheap diff: words that weren't there before
  const had = new Set(before.split(" "));
  return now.split(" ").filter((w) => !had.has(w)).join(" ");
}

/** Hosts a page loaded data from with fetch/XHR while loading (excluding analytics). */
export function dataRequests(log, origin) {
  return log.requests.filter((r) => (r.type === "fetch" || r.type === "xhr") && !ANALYTICS_HOSTS.test(r.url) && !COOKIELESS.test(r.url) && !/\/(_next|@vite|__vite|sockjs|hot-update)/.test(r.url));
}

export const sameOrigin = (url, origin) => {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
};

export function shortUrl(url, origin) {
  try {
    const u = new URL(url);
    return u.origin === origin ? u.pathname + u.search : `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}
