import { findTypos } from "../../lib/spell.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "content.spelling",
  layer: "mechanical",
  async run(ctx) {
    const pages = await ctx.crawl.pages();
    // header and footer repeat on every page: count each distinct piece of text once
    const segments = [...new Set(pages.flatMap((p) => p.segments))];
    const typos = await findTypos(segments);
    const results = [];
    for (const { word, suggestion } of typos) {
      const page = pages.find((p) => p.segments.some((s) => s.includes(word)));
      const source = await ctx.guessSource(word);
      results.push(ctx.fail({
        key: word,
        title: "A word looks misspelled",
        impact: "Typos make the site look careless and cost trust, especially on pricing and sign-up pages",
        location: { url: page?.path ?? null, ...(source ?? {}) },
        evidence: `"${word}" — did you mean "${suggestion}"?`,
        fix: `Change "${word}" to "${suggestion}"`,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
