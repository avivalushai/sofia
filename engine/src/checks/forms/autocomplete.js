import { codeKeys } from "../../lib/code.js";
import { literal, sourceForms } from "../../lib/fields.js";

const TOKEN = { email: "email", tel: "tel", name: "name", username: "username", password: "current-password" };

/** @type {import("../../types.js").Check} */
export default {
  id: "forms.autocomplete",
  layer: "mechanical",
  async run(ctx) {
    const key = codeKeys();
    const results = [];
    for (const { file, forms } of await sourceForms(ctx.project)) {
      for (const form of forms) {
        const formOff = /^off$/i.test(literal(form.attrs.autocomplete) ?? "");
        for (const f of form.fields) {
          const token = TOKEN[f.kind];
          if (!token) continue;
          const value = literal(f.attrs.autocomplete);
          if (value && /^\{/.test(value)) continue; // set by code
          if (value && !/^off$/i.test(value) && !formOff) continue;
          const off = /^off$/i.test(value ?? "") || formOff;
          const suggested = f.kind === "password" && /new|sign.?up|register|confirm|הרשמה/i.test(form.body) ? "new-password" : token;
          results.push(ctx.fail({
            key: key(file, f.text),
            title: off ? "Autofill is switched off on a field people fill in all the time" : "The browser can't fill this field in for people",
            impact: "People have to type their details by hand on every visit (slow and error-prone on a phone), and password managers may not recognise the form",
            location: { file, line: f.line },
            evidence: `${f.text.replace(/\s+/g, " ").slice(0, 120)}${off ? " — autocomplete is off" : " — no autocomplete"}`,
            fix: `Add autocomplete="${suggested}" to this field`,
          }));
        }
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
