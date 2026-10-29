import { scanSource } from "../../lib/code.js";

/** keys that are fine to keep in the browser */
const SETTINGS_KEY = /theme|dark|mode|lang|locale|consent|cookie|token|session|auth|sidebar|tour|onboard|seen|dismiss|banner|cart-open|prefer|setting|version|debug|ph_|_ga|amplitude|intercom|crisp/i;
const SAVE = /localStorage\.setItem\(\s*([^,]+),\s*JSON\.stringify\(|(?:localforage|idb-keyval|set)\s*\(\s*["'`][^"'`]+["'`]\s*,|indexedDB\.open\(|new Dexie\(/g;
const SERVER_WRITE = /method\s*:\s*["'`](POST|PUT|PATCH)["'`]|axios\.(post|put|patch)\(|\.insert\(|\.upsert\(|addDoc\(|setDoc\(|\$fetch\([^)]*method/;

/** @type {import("../../types.js").Check} */
export default {
  id: "data.local-only",
  layer: "browser",
  async run(ctx) {
    if (ctx.detected.db?.value) return [ctx.pass()];

    // 1. what the pages actually store while loading
    const stored = new Map();
    for (const page of (await ctx.crawl.browserPages()).slice(0, 10)) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      const entries = await p.evaluate(() => Object.entries(localStorage).map(([k, v]) => ({ k, size: v.length, json: /^[[{]/.test(v.trim()) })));
      for (const e of entries) if (e.json && e.size > 50 && !SETTINGS_KEY.test(e.k)) stored.set(e.k, { ...e, path: page.path });
    }

    // 2. what the code saves
    const saves = (await scanSource(ctx.project, SAVE, { skipComments: true })).filter((h) => !SETTINGS_KEY.test(h.match[1] ?? h.lineText));
    let serverWrites = false;
    for (const f of ctx.project.shippedSource()) if (SERVER_WRITE.test((await ctx.project.read(f)) ?? "")) serverWrites = true;

    if ((!saves.length && !stored.size) || serverWrites) return [ctx.pass()];
    const first = saves[0];
    return [ctx.fail({
      key: "app",
      title: "What people create is saved only in their browser",
      impact: "If someone switches phone, clears their browser or opens the site on another device, everything they made is gone — and you can't see or back it up",
      location: first ? { file: first.file, line: first.line } : { url: [...stored.values()][0].path },
      evidence: [
        saves.length ? `Saved with browser storage in ${[...new Set(saves.map((s) => s.file))].slice(0, 3).join(", ")}` : null,
        stored.size ? `Pages store ${[...stored.keys()].slice(0, 3).join(", ")} in the browser` : null,
        "no database or server save found",
      ].filter(Boolean).join("; "),
      fix: "Either save to a database so it's kept safely, or tell people clearly that their data stays on this device",
      options: [
        { label: "Save it to a database", detail: "I'll set one up (e.g. Supabase, free tier) and move saving there" },
        { label: "Keep it on the device, and say so", detail: "A clear note plus an export button, so nobody loses work by surprise" },
      ],
    })];
  },
};
