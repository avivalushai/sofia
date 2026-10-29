import { codeKeys } from "../../lib/code.js";
import { isLoginOrSearch, literal, sendsSomewhere, sourceForms, typed } from "../../lib/fields.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "forms.enterkey",
  layer: "mechanical",
  async run(ctx) {
    const key = codeKeys();
    const results = [];
    for (const { file, forms, code } of await sourceForms(ctx.project)) {
      for (const form of forms) {
        if (!sendsSomewhere(form, code)) continue;
        const fields = form.fields.filter((f) => f.tag === "input" && typed(f));
        // one-field forms and login/search forms already get a sensible key
        if (fields.length < 2 || isLoginOrSearch(form)) continue;
        if (fields.some((f) => literal(f.attrs.enterkeyhint))) continue;
        results.push(ctx.fail({
          key: key(file, form.body.split("\n")[0]),
          title: "The phone keyboard doesn't guide people through the form",
          impact: "On phones the Enter key says \"Go\" or \"Return\" on every field, so people tap it and send a half-filled form, or close the keyboard and hunt for the next field",
          location: { file, line: form.line },
          evidence: `${fields.length} fields, none with enterkeyhint`,
          fix: 'Add enterkeyhint="next" to each field except the last, and enterkeyhint="send" (or "done") to the last one',
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
