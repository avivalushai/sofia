// the user agents AI assistants send when a person asks them to open a page
const AGENTS = [
  { name: "ChatGPT", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot" },
  { name: "Claude", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)" },
  { name: "Perplexity", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)" },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "agent.bot-wall",
  // asks for the site as an AI agent: runs last, see runner
  probe: true,
  // a challenge page is what this check looks for, not a reason to give up
  expectsBlocks: true,
  layer: "browser",
  async run(ctx) {
    if (ctx.isLocalTarget) return [ctx.skip("scanning a local address — bot protection is set up by your host on the live site")];
    const walled = (res) => res.status === 403 || res.status === 429 || res.status === 503 || res.blocked;
    // if an ordinary browser is challenged too, it's this machine that's blocked, not the agents
    const base = await ctx.http.request(ctx.target, { as: "none" }).catch(() => null);
    if (!base || walled(base)) {
      return [ctx.uncertain({ key: "site", title: "Couldn't tell whether AI assistants are blocked", evidence: `the site ${base ? `answered ${base.status}` : "didn't answer"} to an ordinary browser request from this machine too` })];
    }
    const blocked = [];
    for (const a of AGENTS) {
      await new Promise((r) => setTimeout(r, 400));
      const res = await ctx.http.request(ctx.target, { headers: { "user-agent": a.ua } }).catch(() => null);
      if (res && walled(res)) blocked.push(`${a.name} got ${res.status}${res.blocked ? " (a bot challenge page)" : ""}`);
    }
    if (!blocked.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "AI assistants are blocked from opening the site",
      impact: "When someone asks ChatGPT, Claude or Perplexity about the business, or to book or buy something on the site, the assistant can't open it, so it answers from old information or sends them elsewhere",
      location: { url: "/" },
      evidence: blocked.join("; "),
      fix: "Allow AI assistants in the host's bot protection settings",
      options: [
        { label: "Allow AI assistants that act for a person (recommended)", detail: "ChatGPT-User, Claude-User and Perplexity-User open pages only when someone asks; training crawlers stay blocked" },
        { label: "Allow all verified AI bots", detail: "Most visibility in AI tools, including crawlers that collect training data" },
        { label: "Keep blocking", detail: "Fine if the site shouldn't appear in AI tools at all" },
      ],
    })];
  },
};
