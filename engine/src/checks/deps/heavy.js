/** Libraries that are heavy for what most apps use them for, and a lighter way to do the same. */
const HEAVY = [
  { name: "moment", kb: 72, instead: "date-fns or dayjs (2–10 KB), or the built-in Intl.DateTimeFormat" },
  { name: "moment-timezone", kb: 100, instead: "date-fns-tz or Intl.DateTimeFormat with timeZone" },
  { name: "lodash", kb: 25, instead: "importing single functions (lodash-es/debounce) or plain JavaScript", imported: /from\s+["']lodash["']|require\(\s*["']lodash["']\)/ },
  { name: "jquery", kb: 30, instead: "plain DOM methods (querySelector, fetch, classList), since the app already uses a framework", onlyWith: ["react", "vue", "svelte", "next", "@angular/core", "solid-js"] },
  { name: "underscore", kb: 7, instead: "plain JavaScript array and object methods" },
  { name: "aws-sdk", kb: 900, instead: "the modular @aws-sdk/client-* package for the one service you use" },
  { name: "@mui/icons-material", kb: 0, instead: "importing each icon from its own path (@mui/icons-material/Add)", imported: /from\s+["']@mui\/icons-material["']/ },
  { name: "react-icons", kb: 0, instead: "importing from one set only, or switching to a tree-shaken set like lucide-react", imported: /from\s+["']react-icons\/(fa6?|md|ai|bi|bs|fi|gi|hi2?|io5?|ri|si|ti|tb|wi)["']/, minSets: 3 },
  { name: "core-js", kb: 50, instead: "removing it: modern browsers don't need the full polyfill set" },
  { name: "chart.js", kb: 70, instead: "a small chart library (uPlot, Chartist) or an SVG chart, for one or two simple charts", maxFiles: 1 },
  { name: "three", kb: 150, instead: "a CSS or SVG animation, for a single decorative effect", maxFiles: 1 },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "deps.heavy",
  layer: "mechanical",
  async run(ctx) {
    const deps = ctx.project.deps;
    const files = ctx.project.shippedSource();
    const findings = [];
    for (const h of HEAVY) {
      if (!deps.has(h.name)) continue;
      if (h.onlyWith && !h.onlyWith.some((d) => deps.has(d))) continue;
      const re = h.imported ?? new RegExp(`from\\s+["']${h.name.replace(/[/.]/g, "\\$&")}(/[^"']*)?["']|require\\(\\s*["']${h.name.replace(/[/.]/g, "\\$&")}["']\\)`);
      const using = [];
      const sets = new Set();
      for (const f of files) {
        const t = (await ctx.project.read(f)) ?? "";
        const m = t.match(new RegExp(re.source, "g"));
        if (m) {
          using.push(f);
          for (const x of m) sets.add(x);
        }
      }
      if (!using.length) continue;
      if (h.minSets && sets.size < h.minSets) continue;
      if (h.maxFiles && using.length > h.maxFiles) continue;
      // used in a handful of places: the weight buys little
      if (!h.imported && !h.maxFiles && using.length > 5) continue;
      findings.push({ ...h, using });
    }
    if (!findings.length) return [ctx.pass()];
    const f = findings[0];
    return [ctx.fail({
      key: "site",
      title: findings.length === 1 ? `${f.name} adds weight for a small job` : `${findings.length} libraries add weight for a small job`,
      impact: "Every visitor downloads and runs these on a phone connection, for a few uses that lighter code does just as well",
      location: { file: f.using[0] },
      evidence: findings.map((x) => `${x.name}${x.kb ? ` (~${x.kb} KB)` : ""} used in ${x.using.length} file${x.using.length === 1 ? "" : "s"}`).join("; "),
      fix: findings.map((x) => `${x.name} → ${x.instead}`).join("; "),
      options: [
        { label: "Replace them (recommended)", detail: "I'll swap each use for the lighter version and check every screen that uses it" },
        { label: "Replace only the heaviest", detail: `Start with ${[...findings].sort((a, b) => b.kb - a.kb)[0].name}` },
        { label: "Keep them", detail: "If more of the app will use them soon" },
      ],
    })];
  },
};
