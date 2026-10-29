import { all, attr } from "../../lib/html.js";

const PATTERNS = [
  { id: "lorem", re: /lorem ipsum|dolor sit amet|consectetur adipiscing/i, what: "Lorem ipsum filler text" },
  { id: "todo", re: /\b(TODO|FIXME|TBD)\b/, what: "a TODO note" },
  { id: "example-email", re: /\b[\w.+-]+@example\.(com|org|net)\b/i, what: "an example email address" },
  { id: "example-url", re: /\bhttps?:\/\/(www\.)?example\.(com|org|net)\b/i, what: "an example.com link" },
  { id: "doe", re: /\b(John|Jane) Doe\b/, what: "a placeholder name" },
  { id: "phone", re: /\b(123[-. ]?456[-. ]?7890|555[-. ]\d{4})\b/, what: "a placeholder phone number" },
  { id: "your-company", re: /\byour (company|business|brand) name\b|\bcompany name here\b|\[(insert|your) [^\]]{2,30}\]/i, what: "fill-in-the-blank text" },
  { id: "acme", re: /\bacme (corp|inc|co)\b/i, what: "a placeholder company name" },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "content.placeholders",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      const hrefs = all(page.doc, "a").map((a) => attr(a, "href") ?? "").join(" ");
      for (const p of PATTERNS) {
        const segment = page.segments.find((s) => p.re.test(s));
        const inHref = !segment && p.id.startsWith("example") && p.re.test(hrefs);
        if (!segment && !inHref) continue;
        const snippet = segment ? segment.match(p.re)[0] : hrefs.match(p.re)[0];
        const source = await ctx.guessSource(segment ? segment.slice(0, 40) : snippet, page);
        results.push(ctx.fail({
          key: `${page.path}_${p.id}`,
          title: "Placeholder text is still on the page",
          impact: "Visitors see filler text, which makes the site look unfinished and less trustworthy",
          location: { url: page.path, ...(source ?? {}) },
          evidence: `${p.what[0].toUpperCase()}${p.what.slice(1)}: "${(segment ?? snippet).slice(0, 80)}"`,
          fix: "Replace it with the real text",
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
