/** @type {import("../../types.js").Check} */
export default {
  id: "agent.llms-txt",
  layer: "mechanical",
  async run(ctx) {
    const res = await ctx.http.get(new URL("/llms.txt", ctx.target).href).catch(() => null);
    if (res?.blocked) return [ctx.uncertain({ key: "site", title: "Couldn't check for an AI guide file", evidence: "the host's bot protection answered instead of the site" })];
    // a single-page app answers every address with its home page
    const ok = res?.status === 200 && !/<html|<!doctype/i.test(String(res.body).slice(0, 300)) && String(res.body).trim().length > 20;
    if (ok) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "The site has no guide for AI assistants",
      impact: "AI assistants like ChatGPT and Claude have to piece together what the site offers from its pages; a short guide file helps them describe and recommend it correctly",
      location: { url: "/llms.txt" },
      evidence: res ? `/llms.txt answered ${res.status}${res.status === 200 ? " with a web page instead of a text file" : ""}` : "/llms.txt didn't answer",
      fix: "Add /llms.txt: a short Markdown file with the site's name, one paragraph on what it offers, and links to the key pages",
    })];
  },
};
