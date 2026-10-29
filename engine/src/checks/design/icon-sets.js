import { scanSource } from "../../lib/code.js";

/** Icon libraries, keyed by what an import or a stylesheet link looks like. */
const SETS = [
  { name: "Lucide", re: /from\s+["'](lucide-react|lucide-vue-next|lucide-svelte|lucide)["']/ },
  { name: "Heroicons", re: /from\s+["']@heroicons\/(react|vue)/ },
  { name: "Tabler Icons", re: /from\s+["']@tabler\/icons/ },
  { name: "Phosphor", re: /from\s+["'](@phosphor-icons\/|phosphor-react)/ },
  { name: "Radix Icons", re: /from\s+["']@radix-ui\/react-icons["']/ },
  { name: "Material Icons", re: /from\s+["']@mui\/icons-material|fonts\.googleapis\.com\/(css2?\?family=Material\+(Icons|Symbols))/ },
  { name: "Font Awesome", re: /from\s+["']@fortawesome\/|font-awesome|fontawesome\.com|react-icons\/fa6?["']/ },
  { name: "Feather", re: /from\s+["'](react-feather|feather-icons)["']|react-icons\/fi["']/ },
  { name: "Bootstrap Icons", re: /bootstrap-icons|react-icons\/bs["']/ },
  { name: "Ionicons", re: /ionicons|react-icons\/io5?["']/ },
  { name: "Remix Icon", re: /remixicon|react-icons\/ri["']/ },
  { name: "Material Design (react-icons)", re: /react-icons\/md["']/ },
  { name: "Ant Design Icons", re: /from\s+["']@ant-design\/icons["']|react-icons\/ai["']/ },
  { name: "Hero (react-icons)", re: /react-icons\/hi2?["']/ },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "design.icon-sets",
  layer: "mechanical",
  async run(ctx) {
    const used = new Map();
    const files = ctx.project.files.filter((f) => /\.(jsx?|tsx?|mjs|vue|svelte|astro|html?|css)$/.test(f) && !/\.(test|spec|stories)\./.test(f));
    for (const set of SETS) {
      const hits = await scanSource(ctx.project, new RegExp(set.re.source, "g"), { files });
      if (hits.length) used.set(set.name, { files: new Set(hits.map((h) => h.file)), first: hits[0] });
    }
    if (used.size < 2) return [ctx.pass()];
    const sets = [...used].sort((a, b) => b[1].files.size - a[1].files.size);
    const least = sets[sets.length - 1][1].first;
    return [ctx.fail({
      key: "site",
      title: `The site mixes ${used.size} icon styles`,
      impact: "Icons from different sets differ in line weight, corners and size, so next to each other they look mismatched",
      location: { file: least.file, line: least.line },
      evidence: sets.map(([name, u]) => `${name} in ${u.files.size} file${u.files.size === 1 ? "" : "s"}`).join("; "),
      fix: `Use one icon set everywhere: replace the icons from ${sets.slice(1).map(([n]) => n).join(" and ")} with their closest ${sets[0][0]} equivalents`,
      options: [
        { label: `Keep ${sets[0][0]}`, detail: `Used in the most files (${sets[0][1].files.size}): the least to change` },
        { label: `Keep ${sets[1][0]}`, detail: `${sets[1][1].files.size} file${sets[1][1].files.size === 1 ? "" : "s"}` },
        { label: "They're there on purpose", detail: "For example, the product shows several design systems. Nothing changes" },
      ],
    })];
  },
};
