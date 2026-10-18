/** @type {import("../../types.js").Check} */
export default {
  id: "resp.input-zoom",
  layer: "browser",
  async run(ctx) {
    const results = [];
    const width = ctx.viewports.mobile[0];
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width });
      const small = await p.evaluate(() =>
        [...document.querySelectorAll("input, select, textarea")]
          .filter((el) => !["hidden", "checkbox", "radio", "range", "submit", "button", "reset", "image", "color", "file"].includes(el.type) && window.__lc.isVisible(el))
          .map((el) => ({ selector: window.__lc.cssPath(el), size: parseFloat(getComputedStyle(el).fontSize) }))
          .filter((x) => x.size < 16),
      );
      if (!small.length) continue;
      const sizes = [...new Set(small.map((s) => `${Math.round(s.size)}px`))].join(", ");
      results.push(ctx.fail({
        key: page.path,
        title: "iPhones zoom in when someone taps a form field",
        impact: "The page jumps and zooms in as soon as a visitor starts typing, and they have to pinch back out to see the button",
        location: { url: page.path, viewport: width, selector: small[0].selector },
        evidence: `${small.length} field${small.length > 1 ? "s use" : " uses"} ${sizes} text (iPhone zooms below 16px): ${small.slice(0, 3).map((s) => s.selector).join(", ")}`,
        fix: "Set form fields to 16px text on phones",
        shot: await p.screenshot({ highlight: small[0].selector }),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
