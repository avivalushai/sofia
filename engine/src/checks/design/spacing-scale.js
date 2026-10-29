import { listValues, siteDesignValues } from "../../lib/design-values.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "design.spacing-scale",
  layer: "browser",
  async run(ctx) {
    const { space } = await siteDesignValues(ctx);
    // 1–3px are borders and fine tuning, not layout spacing
    const values = [...space].filter(([v]) => Number(v) >= 4);
    const total = values.reduce((s, [, m]) => s + m.n, 0);
    if (!total) return [ctx.pass()];
    // design scales (including Tailwind's half steps: 6, 10, 14) use even pixel values; odd ones
    // like 5, 13 or 21 are almost always one-off nudges
    const off = values.filter(([v]) => Number(v) % 2 !== 0).sort((a, b) => b[1].n - a[1].n);
    const offUses = off.reduce((s, [, m]) => s + m.n, 0);
    if (offUses / total <= 0.2 && values.length <= 16) return [ctx.pass()];
    const odd = (off[0] ?? values.sort((a, b) => a[1].n - b[1].n)[0])[1].example;
    return [ctx.fail({
      key: "site",
      title: "Spacing between things doesn't follow a pattern",
      impact: "Gaps that are almost but not quite the same make sections look slightly off, even when visitors can't say why",
      location: { url: odd.path, viewport: 1280, selector: odd.selector },
      evidence: `${values.length} different spacing values; ${Math.round((offUses / total) * 100)}% of uses are odd pixel values${off.length ? ` (${listValues(off.slice(0, 6))})` : ""}`,
      fix: "Round spacing to steps of 4px (4, 8, 12, 16, 24, 32, 48, 64)",
      options: [
        { label: "Round to the nearest 4px step", detail: "Small, safe changes; the layout keeps its look" },
        { label: "A stricter 8px scale (8, 16, 24, 32, 48, 64)", detail: "Calmer rhythm; more spacing changes" },
        { label: "Show me first", detail: "A list of every place that would change" },
      ],
    })];
  },
};
