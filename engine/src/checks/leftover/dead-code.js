import path from "node:path";

const CODE = /\.(jsx?|tsx?|mjs|cjs|vue|svelte|astro)$/;
const MEDIA = /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|pdf)$/i;
// files the framework or the host loads by their name or place, not by an import
const ENTRY = /(^|\/)(index|main|app|App|_app|_document|layout|page|route|loading|error|not-found|template|middleware|instrumentation|server|worker|sw|service-worker|\+page|\+layout|\+server|\+error|entry[-.](client|server))\.[a-z]+$|(^|\/)(pages|app|routes|api|functions|netlify\/functions|supabase\/functions|server|scripts|bin|e2e|tests?|__tests__|stories|\.storybook)\/|\.(config|test|spec|stories|d)\.[a-z]+$|^[^/]+\.[a-z]+$/;

/** @type {import("../../types.js").Check} */
export default {
  id: "leftover.dead-code",
  layer: "mechanical",
  async run(ctx) {
    const files = ctx.project.files.filter((f) => !/(^|\/)(node_modules|dist|build|\.next|fixtures?)\//.test(f));
    const code = files.filter((f) => CODE.test(f));
    const texts = new Map();
    for (const f of [...code, ...files.filter((f) => /\.(html?|css|scss|md|json)$/.test(f))]) texts.set(f, (await ctx.project.read(f)) ?? "");
    const all = [...texts.values()].join("\n");
    // files loaded by pattern (import.meta.glob, require.context) can't be traced from here
    if (/import\.meta\.glob|require\.context/.test(all)) return [ctx.uncertain({ key: "site", title: "Couldn't tell which files are unused", evidence: "the code loads files by pattern (import.meta.glob or require.context)" })];
    // every relative import and alias import, resolved to a file
    const used = new Set();
    const resolve = (from, spec) => {
      let base;
      if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
      else if (/^[@~#]\//.test(spec)) base = `src/${spec.slice(2)}`;
      else return;
      for (const cand of [base, ...[".js", ".jsx", ".ts", ".tsx", ".mjs", ".vue", ".svelte", ".astro"].map((e) => base + e), ...["index.js", "index.jsx", "index.ts", "index.tsx"].map((i) => `${base}/${i}`)]) {
        if (texts.has(cand) || files.includes(cand)) used.add(cand);
      }
    };
    for (const [f, t] of texts) {
      for (const m of t.matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*|import\s+)["']([^"']+)["']/g)) resolve(f, m[1]);
      for (const m of t.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) resolve(f, m[1].startsWith("/") ? `.${m[1]}` : m[1]);
    }
    const unusedCode = code.filter((f) => !used.has(f) && !ENTRY.test(f));
    // media nobody mentions by name anywhere in the code, styles or pages
    const pagesHtml = (await ctx.crawl.pages()).map((p) => p.html).join("\n");
    const unusedMedia = files.filter((f) => MEDIA.test(f) && !/(^|\/)(favicon|apple-touch-icon|icon|logo|og|share|opengraph|twitter)[^/]*$/i.test(f) && !/(^|\/)(docs?|tests?|fixtures?|\.github|design|promo)\//.test(f)).filter((f) => {
      const name = path.posix.basename(f);
      return !all.includes(name) && !pagesHtml.includes(name) && !all.includes(encodeURI(name));
    });
    if (!unusedCode.length && !unusedMedia.length) return [ctx.pass()];
    const list = [...unusedCode, ...unusedMedia];
    return [ctx.fail({
      key: "site",
      title: `${list.length} file${list.length === 1 ? " isn't" : "s aren't"} used anywhere`,
      impact: "Leftover code and images make the project harder to change safely (and to hand over to someone else or to an AI), and unused images may still be published and downloadable",
      location: { file: list[0] },
      evidence: [unusedCode.length && `code nothing imports: ${unusedCode.slice(0, 5).join(", ")}${unusedCode.length > 5 ? `, and ${unusedCode.length - 5} more` : ""}`, unusedMedia.length && `images and files nothing mentions: ${unusedMedia.slice(0, 5).join(", ")}${unusedMedia.length > 5 ? `, and ${unusedMedia.length - 5} more` : ""}`].filter(Boolean).join("; "),
      fix: "Delete the files that are truly unused (I'll check each one against the running app before removing it, one commit per group so it can be undone)",
    })];
  },
};
