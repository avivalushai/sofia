const TRACKERS = /["'](@sentry\/[a-z-]+|@bugsnag\/[a-z-]+|@rollbar\/[a-z-]+|rollbar|@honeybadger-io\/[a-z-]+|@highlight-run\/[a-z-]+|highlight\.run|@logrocket\/[a-z-]+|logrocket|posthog-js|@datadog\/browser-(rum|logs)|@newrelic\/browser-agent|trackjs|@appsignal\/[a-z-]+|raygun4js|@axiomhq\/[a-z-]+|@vercel\/otel)["']|browser\.sentry-cdn\.com|js\.sentry-cdn\.com|d2wy8f7a9ursnm\.cloudfront\.net\/v\d\/bugsnag|cdn\.logrocket\.io|us\.i\.posthog\.com|app\.posthog\.com|eu\.i\.posthog\.com/;

/** @type {import("../../types.js").Check} */
export default {
  id: "run.error-tracking",
  layer: "mechanical",
  async run(ctx) {
    const deps = [...ctx.project.deps].map((d) => `"${d}"`).join(" ");
    if (TRACKERS.test(deps)) return [ctx.pass()];
    for (const f of ctx.project.shippedSource()) if (TRACKERS.test((await ctx.project.read(f)) ?? "")) return [ctx.pass()];
    for (const p of await ctx.crawl.pages()) if (TRACKERS.test(p.html)) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: "You won't know when the site breaks for someone",
      impact: "When a page crashes or a button fails for a visitor, nothing tells you; you only hear about it if someone bothers to complain, and most just leave",
      location: { file: ctx.project.pkg ? "package.json" : null },
      evidence: "no error-tracking tool (Sentry, Bugsnag, PostHog…) in the dependencies, the code or the pages",
      fix: "Add an error tracker that emails you when visitors hit errors",
      options: [
        { label: "Sentry (recommended)", detail: "The standard; free for 5,000 errors a month; one setup step for most frameworks" },
        { label: "PostHog", detail: "Errors plus analytics and session replays in one tool; free tier is generous" },
        { label: "Your host's built-in logs", detail: "Vercel or Netlify logs catch server errors only, not what breaks in visitors' browsers" },
      ],
    })];
  },
};
