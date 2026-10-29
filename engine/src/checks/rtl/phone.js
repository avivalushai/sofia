import { codeKeys } from "../../lib/code.js";
import { literal, sourceForms } from "../../lib/fields.js";

// the two ways most Israelis type a mobile number
const ISRAELI = ["0501234567", "050-1234567"];
const US_LOOK = /\(\d{3}\)\s?\d{3}-\d{4}|\+1[\s-]?\(?\d{3}\)?|\b\d{3}-\d{3}-\d{4}\b/;
const US_COUNTRY = /(defaultCountry|country)\s*=\s*\{?\s*["'](us|US)["']/;

/** @type {import("../../types.js").Check} */
export default {
  id: "rtl.phone",
  layer: "mechanical",
  async run(ctx) {
    const key = codeKeys();
    const results = [];
    for (const { file, forms, code } of await sourceForms(ctx.project)) {
      for (const f of forms.flatMap((x) => x.fields).filter((x) => x.kind === "tel")) {
        const pattern = literal(f.attrs.pattern);
        const max = Number(literal(f.attrs.maxlength) ?? Infinity);
        const placeholder = literal(f.attrs.placeholder) ?? "";
        const why = [];
        if (pattern && !/^\{/.test(pattern)) {
          let re = null;
          try {
            re = new RegExp(`^(?:${pattern})$`, "v");
          } catch {
            try {
              re = new RegExp(`^(?:${pattern})$`);
            } catch {}
          }
          const rejected = re ? ISRAELI.filter((n) => !re.test(n)) : [];
          if (rejected.length) why.push(`its pattern "${pattern}" rejects ${rejected.join(" and ")}`);
        }
        if (max < 10) why.push(`it accepts at most ${max} characters; an Israeli mobile number has 10 digits`);
        if (US_LOOK.test(placeholder)) why.push(`its example "${placeholder}" is an American number`);
        if (!why.length) continue;
        results.push(ctx.fail({
          key: key(file, f.text),
          title: "The phone field doesn't accept Israeli numbers",
          impact: "Israeli visitors can't send the form with their real number, so they give up or type a fake one",
          location: { file, line: f.line },
          evidence: why.join("; "),
          fix: "Accept Israeli formats (050-1234567, 0501234567, +972…): drop the strict pattern or use one like [0-9+\\- ]{9,15}, and show an Israeli example such as 050-1234567",
        }));
      }
      const us = code.match(US_COUNTRY);
      if (us && /phone/i.test(code)) {
        const line = code.slice(0, us.index).split("\n").length;
        results.push(ctx.fail({
          key: key(file, us[0]),
          title: "The phone field starts with the US country code",
          impact: "Israeli visitors see +1 and an American flag; many don't notice and type a number that won't work",
          location: { file, line },
          evidence: us[0],
          fix: 'Set the default country to Israel (defaultCountry="IL")',
        }));
      }
    }
    // numbers shown on the pages themselves
    for (const page of await ctx.crawl.pages()) {
      if (!/[֐-׿]/.test(page.text)) continue;
      const m = page.text.match(/\(\d{3}\)\s?\d{3}-\d{4}|\+1[\s-]\(?\d{3}\)?[\s-]?\d{3}-\d{4}/);
      if (!m) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "A phone number on the page is written the American way",
        impact: "Israeli visitors don't recognise (050) 123-4567 as a local number, and some phones won't dial it correctly",
        location: { url: page.path, file: await ctx.pageSource(page) },
        evidence: `"${m[0]}"`,
        fix: "Write it the Israeli way: 050-1234567 (or +972-50-1234567 for visitors abroad)",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
