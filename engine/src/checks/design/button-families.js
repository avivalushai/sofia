import { deltaE, parseColor } from "../../lib/color.js";

/** Primary (filled) buttons and a visual signature for each. */
function buttonSignatures() {
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  return [...document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[href]')]
    .filter((el) => window.__lc.isVisible(el))
    .map((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const radius = parseFloat(s.borderTopLeftRadius) || 0;
      return {
        selector: window.__lc.cssPath(el),
        text: (el.innerText || el.value || "").trim().slice(0, 30),
        bg: s.backgroundColor,
        pageBg: bodyBg === "rgba(0, 0, 0, 0)" ? "rgb(255, 255, 255)" : bodyBg,
        shape: radius === 0 ? "square" : radius >= r.height / 2 - 1 ? "pill" : radius <= 6 ? "slightly rounded" : "rounded",
        shadow: s.boxShadow !== "none",
        border: parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none",
        weight: Number(s.fontWeight) >= 600 ? "bold" : "regular",
        upper: s.textTransform === "uppercase",
        isLink: el.localName === "a",
        display: s.display,
      };
    });
}

/** @type {import("../../types.js").Check} */
export default {
  id: "design.button-families",
  layer: "browser",
  async run(ctx) {
    const families = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      for (const b of await p.evaluate(buttonSignatures)) {
        const bg = parseColor(b.bg);
        const pageBg = parseColor(b.pageBg);
        // "primary" = clearly filled with a colour that stands out from the page
        if (!bg || bg.a < 0.9 || !pageBg || deltaE(bg, pageBg) < 15) continue;
        if (b.isLink && b.display === "inline") continue;
        const sig = [b.shape, b.shadow ? "shadow" : "flat", b.border ? "border" : "no border", b.weight, b.upper ? "capitals" : ""].filter(Boolean).join(", ");
        if (!families.has(sig)) families.set(sig, { sig, count: 0, examples: [] });
        const f = families.get(sig);
        f.count++;
        if (f.examples.length < 2) f.examples.push(`${b.text ? `"${b.text}"` : b.selector} on ${page.path}`);
        f.first ??= { path: page.path, selector: b.selector };
      }
    }
    const real = [...families.values()].filter((f) => f.count >= 2).sort((a, b) => b.count - a.count || (a.sig < b.sig ? -1 : 1));
    if (real.length < 2) return [ctx.pass()];
    const odd = real[real.length - 1].first;
    const shotPage = await ctx.browser.open(new URL(odd.path, ctx.target).href, { width: 1280 });
    return [ctx.fail({
      key: "site",
      title: `Main buttons come in ${real.length} different styles`,
      impact: "When the same kind of button looks different from page to page, the site feels stitched together and visitors hesitate over what's clickable",
      location: { url: odd.path, viewport: 1280, selector: odd.selector },
      shot: await shotPage.screenshot({ highlight: odd.selector }),
      evidence: real.map((f) => `${f.count}× ${f.sig} (e.g. ${f.examples.join(", ")})`).join("; "),
      fix: "Pick one style for main buttons and use it everywhere",
      options: [
        ...real.slice(0, 2).map((f, i) => ({ label: `Keep ${f.sig}`, detail: i === 0 ? `Used most (${f.count} buttons) — the least to change` : `${f.count} buttons` })),
        { label: "Show me first", detail: "Side-by-side screenshots before anything changes" },
      ],
    })];
  },
};
