import { cluster, hex, isGray, parseColor } from "../../lib/color.js";

/** colours closer than this look the same to most people, so having both is accidental */
const NEAR = 6;
const MAX_NEAR_GROUPS = 3;
const MAX_GRAYS = 8;
/** Tailwind's gray families (v3 hex values): a full scale from one family is a deliberate system */
const TAILWIND_GRAYS = {
  slate: ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#020617"],
  gray: ["#f9fafb", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#4b5563", "#374151", "#1f2937", "#111827", "#030712"],
  zinc: ["#fafafa", "#f4f4f5", "#e4e4e7", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#27272a", "#18181b", "#09090b"],
  neutral: ["#fafafa", "#f5f5f5", "#e5e5e5", "#d4d4d4", "#a3a3a3", "#737373", "#525252", "#404040", "#262626", "#171717", "#0a0a0a"],
  stone: ["#fafaf9", "#f5f5f4", "#e7e5e4", "#d6d3d1", "#a8a29e", "#78716c", "#57534e", "#44403c", "#292524", "#1c1917", "#0c0a09"],
};
/** Grays outside the one design scale they mostly come from (all of them, if there's no such scale). */
function offScale(grays) {
  let best = grays;
  for (const scale of Object.values(TAILWIND_GRAYS)) {
    const off = grays.filter((g) => !scale.includes(hex(g)));
    if (off.length < best.length) best = off;
  }
  return best;
}

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
    // shades from one design scale are meant to sit close together
    const scaled = offScale(colors.filter((c) => isGray(c)));
    const onScale = new Set(colors.filter((c) => isGray(c) && !scaled.includes(c)).map(hex));
    const near = cluster(colors.filter((c) => !onScale.has(hex(c))), NEAR).filter((g) => g.length > 1);
    const grays = colors.filter((c) => isGray(c) && hex(c) !== "#ffffff" && hex(c) !== "#000000" && !onScale.has(hex(c)));

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
