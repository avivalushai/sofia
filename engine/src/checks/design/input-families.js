/** Text fields and a visual signature for each. */
function inputSignatures() {
  return [...document.querySelectorAll('input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=password], input[type=number], input[type=search], input[type=url], textarea, select')]
    .filter((el) => window.__lc.isVisible(el))
    .map((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const radius = parseFloat(s.borderTopLeftRadius) || 0;
      const sides = ["Top", "Right", "Bottom", "Left"].map((d) => parseFloat(s[`border${d}Width`]) > 0 && s[`border${d}Style`] !== "none");
      const border = sides.every(Boolean) ? "boxed" : sides[2] && !sides[0] ? "underline" : sides.some(Boolean) ? "partial border" : "no border";
      const bg = s.backgroundColor;
      const filled = !/rgba\(0, 0, 0, 0\)|transparent/.test(bg) && bg !== getComputedStyle(document.body).backgroundColor;
      return {
        selector: window.__lc.cssPath(el),
        label: (el.getAttribute("placeholder") || el.getAttribute("name") || el.localName).slice(0, 30),
        tall: el.localName === "textarea",
        sig: [
          border,
          filled ? "filled" : "plain",
          radius === 0 ? "square" : radius >= r.height / 2 - 1 ? "pill" : radius <= 6 ? "slightly rounded" : "rounded",
          // height in steps of 8px, so 38 and 40 count as the same field
          el.localName === "textarea" ? "" : `${Math.round(r.height / 8) * 8}px tall`,
        ].filter(Boolean).join(", "),
      };
    });
}

/** @type {import("../../types.js").Check} */
export default {
  id: "design.input-families",
  layer: "browser",
  async run(ctx) {
    const families = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      for (const f of await p.evaluate(inputSignatures)) {
        // a textarea differs in height on purpose; compare its look without the height
        const key = f.sig;
        if (!families.has(key)) families.set(key, { sig: key, count: 0, examples: [], first: { path: page.path, selector: f.selector } });
        const fam = families.get(key);
        fam.count++;
        if (fam.examples.length < 2) fam.examples.push(`"${f.label}" on ${page.path}`);
      }
    }
    const real = [...families.values()].sort((a, b) => b.count - a.count || (a.sig < b.sig ? -1 : 1));
    // one odd field (a search box in the header) is normal; two styles in real use is not
    const used = real.filter((f) => f.count >= 2);
    if (used.length < 2) return [ctx.pass()];
    const odd = used[used.length - 1].first;
    const shotPage = await ctx.browser.open(new URL(odd.path, ctx.target).href, { width: 1280 });
    return [ctx.fail({
      key: "site",
      title: `Text fields come in ${used.length} different styles`,
      impact: "Fields that look different from form to form make the site feel inconsistent, and people have to work out each time what's a field",
      location: { url: odd.path, viewport: 1280, selector: odd.selector },
      evidence: used.map((f) => `${f.count}× ${f.sig} (e.g. ${f.examples.join(", ")})`).join("; "),
      fix: "Pick one field style and use it in every form",
      shot: await shotPage.screenshot({ highlight: odd.selector }),
      options: [
        ...used.slice(0, 2).map((f, i) => ({ label: `Keep ${f.sig}`, detail: i === 0 ? `Used most (${f.count} fields): the least to change` : `${f.count} fields` })),
        { label: "Show me first", detail: "Side-by-side screenshots before anything changes" },
      ],
    })];
  },
};
