import { cluster, hex, isGray, parseColor } from "../../lib/color.js";

/** colours closer than this look the same to most people, so having both is accidental */
const NEAR = 6;
const MAX_NEAR_GROUPS = 3;
const MAX_GRAYS = 8;

function collectColors() {
  const seen = new Map();
  const add = (value, el) => {
    if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") return;
    if (!seen.has(value)) seen.set(value, { value, count: 0, example: window.__lc.cssPath(el) });
    seen.get(value).count++;
  };
  for (const el of document.querySelectorAll("body, body *")) {
    if (!window.__lc.isVisible(el)) continue;
    const s = getComputedStyle(el);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) add(s.color, el);
    add(s.backgroundColor, el);
    if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none") add(s.borderTopColor, el);
  }
  return [...seen.values()];
}

/** @type {import("../../types.js").Check} */
export default {
  id: "design.palette",
  layer: "browser",
  async run(ctx) {
    const all = new Map();
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      for (const c of await p.evaluate(collectColors)) {
        const parsed = parseColor(c.value);
        if (!parsed || parsed.a < 0.99) continue; // translucent overlays blend with what's under them
        const key = hex(parsed);
        if (!all.has(key)) all.set(key, { ...parsed, count: 0, example: c.example, path: page.path });
        all.get(key).count += c.count;
      }
    }
    const colors = [...all.values()].sort((a, b) => (hex(a) < hex(b) ? -1 : 1));
    const near = cluster(colors, NEAR).filter((g) => g.length > 1);
    const grays = colors.filter((c) => isGray(c) && hex(c) !== "#ffffff" && hex(c) !== "#000000");

    if (near.length < MAX_NEAR_GROUPS && grays.length <= MAX_GRAYS) return [ctx.pass()];
    const tooManyGrays = grays.length > MAX_GRAYS;
    const example = tooManyGrays ? grays[0] : near[0][0];
    const shotPage = await ctx.browser.open(new URL(example.path, ctx.target).href, { width: 1280 });
    return [ctx.fail({
      key: "site",
      title: tooManyGrays ? `There are ${grays.length} slightly different grays` : "Several colors are almost the same but not quite",
      impact: "Near-identical colors make the design look slightly off and inconsistent, even when visitors can't say why",
      location: { url: example.path, viewport: 1280, selector: example.example },
      evidence: tooManyGrays
        ? `Grays in use: ${grays.map(hex).join(", ")}`
        : `Near-duplicates: ${near.map((g) => g.map(hex).join(" ≈ ")).join("; ")}`,
      fix: tooManyGrays ? "Merge the grays into 3–4 shades and use those everywhere" : "Merge each group of near-identical colors into one",
      options: [
        { label: "Merge into the most-used shades", detail: "Keeps the look closest to what's there now" },
        { label: "Show me the merged palette first", detail: "I'll prepare a side-by-side before changing anything" },
      ],
      shot: await shotPage.screenshot({ highlight: example.example }),
    })];
  },
};
