import { hebrewRatio } from "../../lib/html.js";

// "NIS"/"ILS" next to an amount in Hebrew text
const LATIN_CODE = /\d[\d,.]*\s?(NIS|ILS)\b|\b(NIS|ILS)\s?\d/g;
// European thousands with dots: 1.250 ₪ (Israel uses a comma: 1,250)
const DOT_THOUSANDS = /\b\d{1,3}(\.\d{3})+(?!\.\d)(?=\s?(₪|ש["״]ח|שקל))|(₪\s?)\d{1,3}(\.\d{3})+\b/g;
const BEFORE = /₪\s?\d/g;
const AFTER = /\d\s?₪/g;

/** @type {import("../../types.js").Check} */
export default {
  id: "rtl.currency",
  layer: "mechanical",
  async run(ctx) {
    const problems = [];
    let before = 0;
    let after = 0;
    let firstPage = null;
    for (const page of await ctx.crawl.pages()) {
      if (!(/^(he|iw)\b/i.test(page.lang ?? "") || hebrewRatio(page.text) > 0.3)) continue;
      for (const m of page.text.matchAll(LATIN_CODE)) problems.push({ page, text: `"${m[0]}" on ${page.path}: NIS in Hebrew text` });
      for (const m of page.text.matchAll(DOT_THOUSANDS)) problems.push({ page, text: `"${m[0]}" on ${page.path}: a dot as the thousands separator` });
      const b = page.text.match(BEFORE)?.length ?? 0;
      const a = page.text.match(AFTER)?.length ?? 0;
      before += b;
      after += a;
      if ((a || b) && !firstPage) firstPage = page;
    }
    // either position is fine; switching between them on the same site looks careless
    if (before && after) problems.push({ page: firstPage, text: `₪ appears before the amount ${before} time(s) and after it ${after} time(s)` });
    if (!problems.length) return [ctx.pass()];
    const p = problems[0].page;
    return [ctx.fail({
      key: "site",
      title: "Prices in shekels are written inconsistently",
      impact: "Prices that switch formats, or use foreign conventions, look careless at the exact moment people are deciding whether to pay",
      location: { url: p.path, file: await ctx.pageSource(p) },
      evidence: problems.slice(0, 4).map((x) => x.text).join("; "),
      fix: "Pick one format and use it everywhere: the ₪ sign (not NIS), commas for thousands (1,250 ₪), and the sign on the same side of every amount",
    })];
  },
};
