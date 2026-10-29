/**
 * Runs in the page: the text sizes, spacing, corner radii and shadows actually used by visible
 * elements, with how often each appears and an example element.
 */
export function collectDesignValues() {
  const DEFAULT_MARGIN = { h1: 0.67, h2: 0.83, h3: 1, h4: 1.33, h5: 1.67, h6: 2.33, p: 1, ul: 1, ol: 1, blockquote: 1, figure: 1, dl: 1, pre: 1 };
  const out = { font: {}, space: {}, radius: {}, shadow: {} };
  const add = (bucket, value, el) => {
    const b = (out[bucket][value] ??= { n: 0, example: null });
    b.n++;
    b.example ??= window.__lc.cssPath(el);
  };
  for (const el of document.body.querySelectorAll("*")) {
    if (!window.__lc.isVisible(el) || /^(svg|path|g|circle|rect|line|polyline|polygon|use|script|style|br|hr|img|video|canvas|iframe)$/i.test(el.localName)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) add("font", String(Math.round(parseFloat(s.fontSize) * 2) / 2), el);
    // vertical margins, paddings and gaps: horizontal margins are often "auto" centring
    // the browser's own heading and paragraph margins (0.67em and so on) aren't a design choice
    const own = DEFAULT_MARGIN[el.localName];
    for (const prop of ["marginTop", "marginBottom", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "rowGap", "columnGap"]) {
      const v = parseFloat(s[prop]);
      if (own && prop.startsWith("margin") && Math.abs(v - own * parseFloat(s.fontSize)) < 0.5) continue;
      if (v > 0 && Number.isFinite(v)) add("space", String(Math.round(v)), el);
    }
    const rad = parseFloat(s.borderTopLeftRadius);
    // circles and pills follow the element's size, not a chosen value
    if (rad > 0 && rad < Math.min(r.width, r.height) / 2 - 1) add("radius", String(Math.round(rad)), el);
    if (s.boxShadow && s.boxShadow !== "none") add("shadow", s.boxShadow.replace(/rgba?\([^)]*\)/g, (c) => c.replace(/\s/g, "")), el);
  }
  return out;
}

/** Merges per-page results: value → { n, example: { path, selector } }. */
export async function siteDesignValues(ctx) {
  const all = { font: new Map(), space: new Map(), radius: new Map(), shadow: new Map() };
  for (const page of await ctx.crawl.browserPages()) {
    const p = await ctx.browser.open(page.url, { width: 1280 });
    const v = await p.evaluate(collectDesignValues);
    for (const kind of Object.keys(all)) {
      for (const [value, { n, example }] of Object.entries(v[kind])) {
        const m = all[kind].get(value) ?? { n: 0, example: { path: page.path, selector: example } };
        m.n += n;
        all[kind].set(value, m);
      }
    }
  }
  return all;
}

/** "13px (2×), 15px (1×)" */
export const listValues = (entries, unit = "px") => entries.map(([v, m]) => `${v}${unit} (${m.n}×)`).join(", ");
