/**
 * Parses robots.txt into groups and returns the user-agents whose group blocks the whole site.
 * @param {string} text
 */
export function blockedAgents(text) {
  const blocked = [];
  let agents = [];
  let inRules = false;
  const groups = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, field, value] = m;
    if (field.toLowerCase() === "user-agent") {
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value.toLowerCase());
      if (agents.length === 1) groups.push({ agents, allow: [], disallow: [] });
    } else if (groups.length) {
      inRules = true;
      const g = groups.at(-1);
      if (field.toLowerCase() === "disallow") g.disallow.push(value);
      if (field.toLowerCase() === "allow") g.allow.push(value);
    }
  }
  for (const g of groups) {
    if (g.disallow.includes("/") && !g.allow.includes("/")) {
      for (const a of g.agents) if (a === "*" || a === "googlebot" || a === "bingbot") blocked.push(a);
    }
  }
  return blocked;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "seo.robots",
  layer: "mechanical",
  async run(ctx) {
    const res = await ctx.http.get(new URL("/robots.txt", ctx.target).href);
    if (res.status !== 200 || /<html/i.test(res.body.slice(0, 500))) return [ctx.pass()];
    const blocked = blockedAgents(res.body);
    if (!blocked.length) return [ctx.pass()];
    return [ctx.fail({
      key: "/robots.txt",
      title: "Search engines are told not to list the site",
      impact: "The site won't show up on Google, so nobody finds it by searching",
      location: { url: "/robots.txt", file: ctx.project.files.find((f) => /(^|\/)robots\.txt$/.test(f)) ?? null },
      evidence: `robots.txt has "Disallow: /" for ${blocked.map((a) => (a === "*" ? "all crawlers" : a)).join(", ")}`,
      fix: 'Change robots.txt to allow crawlers: "User-agent: *" followed by "Allow: /"',
    })];
  },
};
