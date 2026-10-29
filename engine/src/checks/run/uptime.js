import { guide, textOf } from "../../lib/guided.js";

const MONITOR = /uptimerobot|betteruptime|better-uptime|betterstack|statuspage\.io|instatus|checkly|pingdom|hetrixtools|freshping|cronitor|healthchecks\.io|uptime-kuma|openstatus|upptime/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "run.uptime",
  layer: "mechanical",
  async run(ctx) {
    const config = await textOf(ctx.project, /(^|\/)(package\.json|README\.md|\.github\/workflows\/.+\.ya?ml|checkly\.config\.[jt]s|\.upptimerc\.yml|[^/]+\.config\.[jt]s)$/i);
    const pages = (await ctx.crawl.pages()).map((p) => p.html).join("\n");
    if (MONITOR.test(config) || MONITOR.test(pages)) return [ctx.pass()];
    return [guide(ctx, {
      title: "Get an alert when the site goes down",
      evidence: "no uptime monitor was found in the project or on the pages; one may exist in an outside account",
      steps: [
        "Open uptimerobot.com (free for 50 monitors, checks every 5 minutes)",
        "Add an HTTPS monitor for the home page, and one for your most important page (sign-up or checkout)",
        "Set alerts to your email and phone (the app sends push notifications)",
      ],
    })];
  },
};
