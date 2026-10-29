import { createHash } from "node:crypto";

const COPY_NAME = /^(.*?)(?: copy(?: \d+)?| \(\d+\)|[-_ ](?:old|new|backup|bak|copy|v\d+|final|orig|original|\d))(\.[a-z0-9]+)$/i;
const MAX_FILES = 600;

const normalize = (t) => t.split("\n").map((l) => l.trim()).filter((l) => l && !/^(\/\/|\*|\/\*)/.test(l));

/** @type {import("../../types.js").Check} */
export default {
  id: "leftover.duplicate-files",
  layer: "mechanical",
  async run(ctx) {
    const files = ctx.project.files.filter((f) => /\.(jsx?|tsx?|vue|svelte|astro|css|scss|html?)$/.test(f) && !/(^|\/)(node_modules|dist|build|\.next|fixtures?|__snapshots__)\//.test(f)).slice(0, MAX_FILES);
    const set = new Set(files);
    const pairs = [];
    // "Button copy.jsx" next to "Button.jsx"
    for (const f of files) {
      const m = f.match(COPY_NAME);
      if (m && set.has(`${m[1]}${m[2]}`)) pairs.push({ a: `${m[1]}${m[2]}`, b: f, why: "a copy by its name" });
    }
    // the same content under two names
    const lines = new Map();
    const byHash = new Map();
    for (const f of files) {
      const n = normalize((await ctx.project.read(f)) ?? "");
      if (n.length < 15) continue;
      lines.set(f, n);
      const h = createHash("sha1").update(n.join("\n")).digest("hex");
      if (byHash.has(h)) pairs.push({ a: byHash.get(h), b: f, why: "identical content" });
      else byHash.set(h, f);
    }
    // nearly the same: 90% of lines shared, similar length, same kind of file
    const list = [...lines];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [fa, la] = list[i];
        const [fb, lb] = list[j];
        if (fa.split(".").pop() !== fb.split(".").pop() || Math.min(la.length, lb.length) / Math.max(la.length, lb.length) < 0.8) continue;
        if (pairs.some((p) => (p.a === fa && p.b === fb) || (p.a === fb && p.b === fa))) continue;
        const sa = new Set(la);
        const shared = lb.filter((l) => sa.has(l)).length;
        if (shared / Math.max(la.length, lb.length) >= 0.9) pairs.push({ a: fa, b: fb, why: `${Math.round((shared / Math.max(la.length, lb.length)) * 100)}% the same lines` });
      }
    }
    if (!pairs.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: pairs.length === 1 ? "Two files do the same job" : `${pairs.length} pairs of files do the same job`,
      impact: "A fix made in one copy doesn't reach the other, so bugs come back and parts of the site drift apart; it also confuses whoever (or whichever AI) edits the code next",
      location: { file: pairs[0].b },
      evidence: pairs.slice(0, 5).map((p) => `${p.a} and ${p.b} (${p.why})`).join("; ") + (pairs.length > 5 ? `; and ${pairs.length - 5} more` : ""),
      fix: "Keep one version of each and point everything to it",
      options: [
        { label: "Merge each pair into one file (recommended)", detail: "I'll keep the one that's in use, move any differences into it and update the imports" },
        { label: "Delete only the obvious copies", detail: "Files named copy, old, backup or v2 that nothing imports" },
        { label: "Keep them", detail: "If the two versions are meant to differ soon" },
      ],
    })];
  },
};
