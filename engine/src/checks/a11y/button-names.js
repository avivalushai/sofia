import { axeCheck } from "../../lib/axe-check.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "a11y.button-names",
  layer: "browser",
  run: (ctx) =>
    axeCheck(ctx, {
      rules: ["button-name", "input-button-name", "link-name"],
      title: (n) => (n === 1 ? "A button has no name" : `${n} buttons and icons have no name`),
      impact: "Screen readers announce just \"button\" or \"link\", so blind visitors can't tell what it does",
      fix: "Give each icon button a name a screen reader can say, like \"Open menu\" or \"Close\"",
      describe: (n) => `${n.target?.[0]} (${n.rule === "link-name" ? "link" : "button"} with no text or label)`,
    }),
};
