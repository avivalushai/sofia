import { codeKeys } from "../../lib/code.js";
import { literal, sourceForms } from "../../lib/fields.js";

const WANT = {
  email: { types: ["email"], label: "email", keyboard: "the keyboard with @ and .com" },
  tel: { types: ["tel"], label: "phone", keyboard: "the number pad" },
  number: { types: ["number", "tel"], inputmode: ["numeric", "decimal"], label: "number", keyboard: "the number pad" },
};

/** @type {import("../../types.js").Check} */
export default {
  id: "forms.input-types",
  layer: "mechanical",
  async run(ctx) {
    const key = codeKeys();
    const results = [];
    for (const { file, forms } of await sourceForms(ctx.project)) {
      for (const f of forms.flatMap((x) => x.fields)) {
        const want = WANT[f.kind];
        if (!want || f.tag !== "input") continue;
        const type = literal(f.attrs.type) ?? "text";
        const mode = literal(f.attrs.inputmode) ?? "";
        if (/^\{/.test(type)) continue; // set by code: can't tell
        if (want.types.includes(type.toLowerCase()) || want.inputmode?.includes(mode) || (f.kind === "tel" && mode === "tel") || (f.kind === "email" && mode === "email")) continue;
        results.push(ctx.fail({
          key: key(file, f.text),
          title: `${want.label === "email" ? "An" : "A"} ${want.label} field opens the wrong keyboard on phones`,
          impact: `People on phones get the plain letter keyboard and have to switch to ${want.keyboard} themselves, which is slower and leads to typos`,
          location: { file, line: f.line },
          evidence: `${f.text.replace(/\s+/g, " ").slice(0, 120)} — type is "${type}"`,
          fix: f.kind === "number" ? 'Use type="number" (or inputmode="numeric" for codes and IDs)' : `Use type="${want.types[0]}"`,
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
