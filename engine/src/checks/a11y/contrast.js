import { axeCheck } from "../../lib/axe-check.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "a11y.contrast",
  layer: "browser",
  run: (ctx) =>
    axeCheck(ctx, {
      rules: ["color-contrast"],
      title: (n) => (n === 1 ? "Some text is too faint to read easily" : `${n} pieces of text are too faint to read easily`),
      impact: "Light text on a light background is hard to read in sunlight, on cheap screens and for anyone with weaker eyesight",
      fix: "Darken the text (or lighten the background) until it passes — usually a step or two darker is enough and still looks subtle",
      describe: (n) => {
        const d = n.any?.[0]?.data ?? {};
        return `${n.target?.[0]}: ${d.fgColor} on ${d.bgColor} is ${d.contrastRatio}, minimum ${d.expectedContrastRatio?.replace(":1", "")}`;
      },
    }),
};
