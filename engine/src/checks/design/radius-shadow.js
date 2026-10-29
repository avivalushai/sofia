import { listValues, siteDesignValues } from "../../lib/design-values.js";

const MAX = 4;

/** @type {import("../../types.js").Check} */
export default {
  id: "design.radius-shadow",
  layer: "browser",
  async run(ctx) {
    const { radius, shadow } = await siteDesignValues(ctx);
    const radii = [...radius].sort((a, b) => Number(a[0]) - Number(b[0]));
    const shadows = [...shadow].sort((a, b) => b[1].n - a[1].n);
    const tooManyRadii = radii.length > MAX;
    const tooManyShadows = shadows.length > MAX;
    if (!tooManyRadii && !tooManyShadows) return [ctx.pass()];
    const odd = (tooManyRadii ? radii.slice().sort((a, b) => a[1].n - b[1].n) : shadows.slice().reverse())[0][1].example;
    const parts = [tooManyRadii && `${radii.length} corner roundings: ${listValues(radii)}`, tooManyShadows && `${shadows.length} different shadows`].filter(Boolean);
    return [ctx.fail({
      key: "site",
      title: tooManyRadii && tooManyShadows ? "Corners and shadows vary from element to element" : tooManyRadii ? "Corners are rounded in many different ways" : "Shadows vary from element to element",
      impact: "Cards, buttons and fields that are rounded or lifted a little differently each make the site feel assembled from parts rather than designed",
      location: { url: odd.path, viewport: 1280, selector: odd.selector },
      evidence: parts.join("; "),
      fix: "Use a few named values: one small and one large rounding, and two or three shadow levels",
      options: [
        { label: "Keep the most-used values", detail: "Rare roundings and shadows move to the closest common one" },
        { label: "A simple set: 4px and 12px corners, a light and a strong shadow", detail: "Most consistent; more elements change slightly" },
        { label: "Show me first", detail: "A list of every place that would change" },
      ],
    })];
  },
};
