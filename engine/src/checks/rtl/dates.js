import { scanSource } from "../../lib/code.js";

// month first, and the second number can only be a day: 03/14/2026, 12-25-26
const US_DATE = /\b(0?[1-9]|1[0-2])([/.-])(1[3-9]|2\d|3[01])\2(\d{4}|\d{2})\b/g;
// code that formats dates the American way, or with no locale on a Hebrew site
const US_FORMAT = /toLocaleDateString\(\s*["']en-US["']|toLocaleDateString\(\s*\)|toLocaleString\(\s*["']en-US["']|format\([^)]*["']MM[/.-]dd|["']MM\/DD\/YYYY["']|dayjs\([^)]*\)\.format\(\s*["']MM[/.-]DD/g;

/** @type {import("../../types.js").Check} */
export default {
  id: "rtl.dates",
  layer: "mechanical",
  async run(ctx) {
    const seen = [];
    for (const page of await ctx.crawl.pages()) {
      for (const m of page.text.matchAll(US_DATE)) seen.push({ where: page.path, what: m[0], page });
    }
    const code = await scanSource(ctx.project, US_FORMAT, { skipComments: true });
    if (!seen.length && !code.length) return [ctx.pass()];
    const first = code[0];
    return [ctx.fail({
      key: "site",
      title: "Dates are written month-first, the American way",
      impact: "Israeli visitors read 03/04 as 3 April, not 4 March, so a date like this can send someone to the wrong day",
      location: first ? { file: first.file, line: first.line } : { url: seen[0].where, file: await ctx.pageSource(seen[0].page) },
      evidence: [
        ...seen.slice(0, 3).map((s) => `"${s.what}" on ${s.where}`),
        ...code.slice(0, 3).map((c) => `${c.file}:${c.line} ${c.match[0]}`),
      ].join("; "),
      fix: 'Write dates day first (14/03/2026, or "14 במרץ 2026"); in code use toLocaleDateString("he-IL")',
    })];
  },
};
