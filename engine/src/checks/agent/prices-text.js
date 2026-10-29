const PRICE_PAGE = /pric|plans?\b|tarif|shop|store|menu|מחיר|מחירון|חבילות|תעריפ|חנות|תפריט/i;
const PRICE_TEXT = /[$€£₪]\s?\d|\d\s?[$€£₪]|\d+([.,]\d+)?\s?(ש"ח|ש״ח|שקל|nis|ils|usd|eur)\b|\/\s?(mo|month|year|חודש|שנה)\b/i;

/** Runs in the page: its text, and pictures that look like they carry the prices. */
function scan(pricePage) {
  const text = document.body?.innerText ?? "";
  const imgs = [...document.querySelectorAll("img, [role=img]")]
    .filter((el) => window.__lc.isVisible(el))
    .map((el) => ({ el, r: el.getBoundingClientRect(), label: `${el.getAttribute("alt") ?? ""} ${el.getAttribute("src") ?? ""} ${el.getAttribute("aria-label") ?? ""}` }))
    .filter(({ r, label }) => r.width >= 200 && r.height >= 120 && (pricePage.test(label) || /\d+\s?[$€£₪]|[$€£₪]\s?\d/.test(label)));
  return { text, images: imgs.map(({ el, label }) => ({ selector: window.__lc.cssPath(el), label: label.trim().slice(0, 80) })) };
}

/** @type {import("../../types.js").Check} */
export default {
  id: "agent.prices-text",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      const s = await p.evaluate(scan, PRICE_PAGE);
      const priceish = PRICE_PAGE.test(page.path) || PRICE_PAGE.test(s.text.slice(0, 600));
      // prices written as text anywhere on the page: fine, whatever the pictures show
      if (!priceish || PRICE_TEXT.test(s.text) || !s.images.length) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "Prices are shown only inside a picture",
        impact: "AI assistants, search engines and screen readers can't read prices in an image, so when someone asks \"how much does it cost?\" they get no answer, or a wrong one",
        location: { url: page.path, viewport: 1280, selector: s.images[0].selector },
        evidence: `the page has no prices in its text; ${s.images.length === 1 ? "the image" : `${s.images.length} images`} (${s.images.slice(0, 2).map((i) => `"${i.label}"`).join(", ")}) ${s.images.length === 1 ? "seems" : "seem"} to carry them`,
        fix: "Write the prices as text on the page (the image can stay for design, with the prices also in its alt text)",
        shot: await p.screenshot({ highlight: s.images[0].selector }),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
