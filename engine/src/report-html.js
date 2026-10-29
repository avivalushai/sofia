import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_DIR } from "./state.js";
import { buildSummary } from "./summary.js";

/** The prebuilt page, shipped with the plugin (docs/05: no build step at install time). */
export const UI_DIR = fileURLToPath(new URL("../../ui/dist/", import.meta.url));

/** What the page needs: the state, its summary, the catalog (trimmed) and the project name. */
export function pageData(catalog, state, root) {
  const checks = catalog.checks.map(({ id, title, category, categoryTitle, layer, severity, fixer, v1, appliesWhen }) => ({ id, title, category, categoryTitle, layer, severity, fixer, v1, appliesWhen }));
  return { state, summary: state.runs.length ? buildSummary(catalog, state) : null, catalog: checks, project: path.basename(root) };
}

/** Screenshots the page can show: those of findings still on it (a fully fixed check has no row). */
async function embedShots(root, state) {
  const visible = new Set(Object.values(state.findings).filter((f) => f.status !== "fixed").map((f) => f.checkId));
  const shots = {};
  for (const f of Object.values(state.findings)) {
    if (!visible.has(f.checkId)) continue;
    for (const src of [f.shots?.before, f.shots?.after]) {
      if (!src || shots[src]) continue;
      try {
        const body = await readFile(path.join(root, STATE_DIR, src));
        shots[src] = `data:image/png;base64,${body.toString("base64")}`;
      } catch {}
    }
  }
  return shots;
}

/** The page's fonts (ui/dist/fonts) as data URIs, so the saved copy looks the same offline. */
async function inlineFonts(css) {
  const files = [...new Set([...css.matchAll(/url\("(fonts\/[^"]+\.woff2)"\)/g)].map((m) => m[1]))];
  const data = new Map(await Promise.all(files.map(async (f) => [f, (await readFile(path.join(UI_DIR, f))).toString("base64")])));
  return css.replace(/url\("(fonts\/[^"]+\.woff2)"\)/g, (_, f) => `url("data:font/woff2;base64,${data.get(f)}")`);
}

/**
 * The same page as the live one (docs/05 "Export"), as one file: styles, script, results and
 * screenshots inlined. Opens straight from disk, no server, nothing loaded from the network.
 */
export async function renderHtmlReport(root, catalog, state) {
  const [html, css, js] = await Promise.all(["index.html", "app.css", "app.js"].map((f) => readFile(path.join(UI_DIR, f), "utf8")));
  const style = await inlineFonts(css);
  const data = { ...pageData(catalog, state, root), shots: await embedShots(root, state), savedAt: new Date().toISOString() };
  // JSON inside <script>: escape "<" so no value can close the tag
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return html
    .replace(`<link rel="stylesheet" href="app.css">`, () => `<style>\n${style}</style>`)
    .replace(`<script type="module" src="app.js"></script>`, () => `<script id="sofia-data" type="application/json">${json}</script>\n  <script type="module">\n${js}</script>`);
}

export async function writeHtmlReport(root, catalog, state) {
  const file = path.join(root, STATE_DIR, "report.html");
  await writeFile(file, await renderHtmlReport(root, catalog, state));
  return file;
}
