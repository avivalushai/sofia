import { listValues, siteDesignValues } from "../../lib/design-values.js";

const MAX_SIZES = 8;

/** @type {import("../../types.js").Check} */
export default {
  id: "design.type-scale",
  layer: "browser",
  async run(ctx) {
    const { font } = await siteDesignValues(ctx);
    const sizes = [...font].map(([v, m]) => [Number(v), m]).sort((a, b) => a[0] - b[0]);
    // two sizes a pixel apart, both in real use, are almost always an accident (15 and 16, 17 and 18)
    const near = [];
    for (let i = 1; i < sizes.length; i++) {
      const [a, ma] = sizes[i - 1];
      const [b, mb] = sizes[i];
      if (b - a <= 1 && ma.n >= 2 && mb.n >= 2) near.push([a, b]);
    }
    if (sizes.length <= MAX_SIZES && near.length < 2) return [ctx.pass()];
    const odd = sizes.slice().sort((a, b) => a[1].n - b[1].n)[0][1].example;
    const common = sizes.slice().sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([v]) => v).sort((a, b) => a - b);
    return [ctx.fail({
      key: "site",
      title: `Text comes in ${sizes.length} different sizes`,
      impact: "With many sizes that are almost the same, headings and body text don't line up into a clear order, and the site looks less polished",
      location: { url: odd.path, viewport: 1280, selector: odd.selector },
      evidence: `${listValues(sizes.map(([v, m]) => [v, m]))}${near.length ? `; nearly the same: ${near.map(([a, b]) => `${a}/${b}px`).join(", ")}` : ""}`,
      fix: "Pick a short scale of text sizes and move every size to its nearest step",
      options: [
        { label: `Keep the most-used sizes (${common.join(", ")}px)`, detail: "The least to change: the rare sizes move to their nearest common size" },
        { label: "A standard scale: 12, 14, 16, 20, 24, 32, 48px", detail: "Cleaner steps; more text changes size slightly" },
        { label: "Show me first", detail: "A list of every place that would change, before anything does" },
      ],
    })];
  },
};
