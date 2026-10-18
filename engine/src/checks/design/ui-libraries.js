import { scanSource } from "../../lib/code.js";

/** Styled component libraries. Unstyled primitives (Radix, Headless UI, React Aria) don't clash, so they're left out. */
const LIBRARIES = [
  { name: "Material UI", packages: ["@mui/material", "@material-ui/core"] },
  { name: "Chakra UI", packages: ["@chakra-ui/react"] },
  { name: "Ant Design", packages: ["antd"] },
  { name: "Mantine", packages: ["@mantine/core"] },
  { name: "Bootstrap", packages: ["bootstrap", "react-bootstrap", "reactstrap"] },
  { name: "HeroUI / NextUI", packages: ["@heroui/react", "@nextui-org/react"] },
  { name: "daisyUI", packages: ["daisyui"] },
  { name: "PrimeReact", packages: ["primereact"] },
  { name: "PrimeVue", packages: ["primevue"] },
  { name: "Semantic UI", packages: ["semantic-ui-react"] },
  { name: "Vuetify", packages: ["vuetify"] },
  { name: "Element Plus", packages: ["element-plus"] },
  { name: "Quasar", packages: ["quasar"] },
  { name: "Naive UI", packages: ["naive-ui"] },
  { name: "Flowbite", packages: ["flowbite", "flowbite-react"] },
  { name: "Bulma", packages: ["bulma"] },
  { name: "Fluent UI", packages: ["@fluentui/react-components", "@fluentui/react"] },
  { name: "Blueprint", packages: ["@blueprintjs/core"] },
  { name: "Radix Themes", packages: ["@radix-ui/themes"] },
];
const SHADCN = { name: "shadcn/ui", importRe: /from\s+["'](@|~)\/components\/ui\//g };

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** @type {import("../../types.js").Check} */
export default {
  id: "design.ui-libraries",
  layer: "mechanical",
  async run(ctx) {
    const found = [];
    for (const lib of LIBRARIES) {
      const pkgs = lib.packages.filter((p) => ctx.project.deps.has(p));
      if (!pkgs.length) continue;
      const re = new RegExp(`from\\s+["'](${pkgs.map(escape).join("|")})(/[^"']*)?["']|import\\s+["'](${pkgs.map(escape).join("|")})`, "g");
      const files = new Set((await scanSource(ctx.project, re)).map((h) => h.file));
      found.push({ name: lib.name, files: files.size, packages: pkgs });
    }
    if (ctx.project.has("components.json")) {
      const files = new Set((await scanSource(ctx.project, SHADCN.importRe)).map((h) => h.file));
      found.push({ name: SHADCN.name, files: files.size, packages: ["components.json"] });
    }
    if (found.length < 2) return [ctx.pass()];

    found.sort((a, b) => b.files - a.files || (a.name < b.name ? -1 : 1));
    const [main, ...rest] = found;
    return [ctx.fail({
      key: found.map((f) => f.name).sort().join("+"),
      title: "Two design styles are mixed on the site",
      impact: "Buttons, inputs and menus look different from page to page, so the site feels stitched together — and each library adds weight that slows loading",
      location: { file: "package.json" },
      evidence: found.map((f) => `${f.name} in ${f.files} files`).join(", "),
      fix: `Keep one library and replace the components from the other${rest.length > 1 ? "s" : ""}, then remove ${rest.length > 1 ? "them" : "it"}`,
      options: found.slice(0, 3).map((f, i) => ({
        label: `Keep ${f.name}`,
        detail: i === 0 ? `Used in more places (${f.files} files) — the least to change` : `Used in ${f.files} files`,
      })),
    })];
  },
};
