import { scanSource } from "../../lib/code.js";

/** @type {import("../../types.js").Check} */
export default {
  id: "qa.error-boundary",
  layer: "mechanical",
  async run(ctx) {
    const { deps, files } = ctx.project;
    const has = (re) => files.some((f) => re.test(f));
    const code = async (re) => (await scanSource(ctx.project, re)).length > 0;

    let framework = null;
    let handled = false;
    let fix = "";
    if (deps.has("next")) {
      framework = "Next.js";
      handled = has(/(^|\/)app\/(.*\/)?(global-)?error\.(js|jsx|ts|tsx)$/) || deps.has("react-error-boundary") || (await code(/componentDidCatch|getDerivedStateFromError/g));
      fix = "Add an error screen (app/error.tsx and app/global-error.tsx) that shows a friendly message and a \"Try again\" button";
    } else if (deps.has("@sveltejs/kit")) {
      framework = "SvelteKit";
      handled = has(/(^|\/)src\/routes\/(.*\/)?\+error\.svelte$/);
      fix = "Add src/routes/+error.svelte with a friendly message and a link home";
    } else if (deps.has("nuxt")) {
      framework = "Nuxt";
      handled = has(/(^|\/)error\.vue$/) || (await code(/NuxtErrorBoundary|onErrorCaptured/g));
      fix = "Add error.vue with a friendly message and a link home";
    } else if (deps.has("vue")) {
      framework = "Vue";
      handled = await code(/app\.config\.errorHandler|onErrorCaptured|errorCaptured\s*\(/g);
      fix = "Catch component errors (app.config.errorHandler) and show a friendly message instead of a blank page";
    } else if (deps.has("react") || deps.has("react-dom")) {
      framework = "React";
      handled = deps.has("react-error-boundary") || (await code(/componentDidCatch|getDerivedStateFromError|errorElement\s*[:=]|export\s+function\s+ErrorBoundary/g));
      fix = "Wrap the app in an error boundary that shows a friendly message and a \"Try again\" button";
    }
    if (!framework) return [ctx.skip("no component framework found — plain pages don't go blank when one part breaks")];
    if (handled) return [ctx.pass()];
    return [ctx.fail({
      key: "app",
      title: "If one part of the page breaks, visitors get a blank white screen",
      impact: "A single bug in any component wipes out the whole page with no message, so people think the site is down",
      location: {},
      evidence: `${framework} app with no error fallback (no error boundary or error page found)`,
      fix,
    })];
  },
};
