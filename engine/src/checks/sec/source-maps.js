import { all, attr } from "../../lib/html.js";

// build settings that publish the original source next to the site
const CONFIG = [
  { file: /^next\.config\.(js|mjs|cjs|ts)$/, re: /productionBrowserSourceMaps\s*:\s*true/ },
  { file: /^vite\.config\.(js|mjs|cjs|ts)$/, re: /sourcemap\s*:\s*(true|["']inline["'])/ },
  { file: /^(webpack\.config|craco\.config)\.(js|cjs|mjs|ts)$/, re: /devtool\s*:\s*["'](source-map|inline-source-map|eval-source-map)["']/ },
  { file: /^nuxt\.config\.(js|ts)$/, re: /sourcemap\s*:\s*(true|\{[^}]*client\s*:\s*true)/ },
  { file: /^astro\.config\.(js|mjs|ts)$/, re: /sourcemap\s*:\s*true/ },
  { file: /^angular\.json$/, re: /"sourceMap"\s*:\s*true/ },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.source-maps",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const f of ctx.project.files) {
      const rule = CONFIG.find((c) => c.file.test(f));
      if (rule) {
        const text = (await ctx.project.read(f)) ?? "";
        const m = text.match(rule.re);
        if (m) results.push(found(ctx, { file: f, line: text.slice(0, m.index).split("\n").length }, `${f}: ${m[0]}`));
      }
      // committed map files that get published with the site
      if (/^(public|static)\/.*\.js\.map$/.test(f)) results.push(found(ctx, { file: f }, `${f} is in the folder that's published as-is`));
    }
    if (results.length || ctx.isLocalTarget) return results.length ? results : [ctx.pass()];

    // live: does a script on the home page point to a map that can be downloaded?
    const [home] = await ctx.crawl.pages();
    const scripts = (home ? all(home.doc, "script").map((s) => attr(s, "src")).filter(Boolean) : [])
      .map((s) => new URL(s, home.url))
      .filter((u) => u.origin === ctx.targetUrl.origin)
      .slice(0, 3);
    for (const u of scripts) {
      const js = await ctx.http.get(u.href).catch(() => null);
      if (!js || js.status !== 200) continue;
      const ref = js.headers.sourcemap ?? js.headers["x-sourcemap"] ?? String(js.body).match(/\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/)?.[1];
      if (!ref || ref.startsWith("data:")) continue;
      const mapUrl = new URL(ref, u);
      const map = await ctx.http.get(mapUrl.href).catch(() => null);
      if (map?.status === 200 && /"sources"\s*:/.test(String(map.body).slice(0, 5000))) {
        results.push(found(ctx, { url: mapUrl.pathname }, `${mapUrl.pathname} downloads (${String(map.body).length} bytes of original code)`));
        break;
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};

function found(ctx, location, evidence) {
  return ctx.fail({
    key: location.file ?? location.url,
    title: "Your site's original code can be downloaded",
    impact: "Anyone can read your app's full source, comments and all, which makes it much easier to find weak spots or copy your work",
    location,
    evidence,
    fix: "Turn off source maps for the live build (or upload them privately to your error tracker instead)",
  });
}
