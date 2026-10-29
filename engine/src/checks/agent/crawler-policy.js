const AI_BOTS = /^(gptbot|chatgpt-user|oai-searchbot|claudebot|claude-user|claude-searchbot|anthropic-ai|google-extended|ccbot|perplexitybot|perplexity-user|bytespider|applebot-extended|meta-externalagent|amazonbot|cohere-ai|diffbot)$/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "agent.crawler-policy",
  layer: "mechanical",
  async run(ctx) {
    const res = await ctx.http.get(new URL("/robots.txt", ctx.target).href).catch(() => null);
    if (res?.blocked) return [ctx.uncertain({ key: "site", title: "Couldn't read the crawler rules", evidence: "the host's bot protection answered instead of the site" })];
    const text = res?.status === 200 && !/<html/i.test(String(res.body).slice(0, 300)) ? String(res.body) : null;
    const named = text ? [...text.matchAll(/^\s*user-agent\s*:\s*(\S+)/gim)].map((m) => m[1]).filter((a) => AI_BOTS.test(a)) : [];
    if (named.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "The site hasn't decided what AI crawlers may do",
      impact: "Without a rule, every AI company's crawler can use the content to train models, and you haven't chosen whether AI answer engines may show it, which affects being recommended by ChatGPT, Claude or Perplexity",
      location: { url: "/robots.txt", file: ctx.project.files.find((f) => /(^|\/)robots\.txt$/.test(f)) ?? null },
      evidence: text ? "robots.txt has no rules for AI crawlers (GPTBot, ClaudeBot, Google-Extended, PerplexityBot…)" : "there's no robots.txt",
      fix: "Add rules for AI crawlers to robots.txt",
      options: [
        { label: "Allow AI answers, block training (recommended)", detail: "Assistants can find and quote the site when people ask; GPTBot, ClaudeBot, Google-Extended and CCBot can't use it to train models" },
        { label: "Allow all AI crawlers", detail: "The most visibility in AI tools; content can also be used for training" },
        { label: "Block all AI crawlers", detail: "Keeps the content out of AI tools entirely, including their answers and recommendations" },
      ],
    })];
  },
};
