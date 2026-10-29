import { scanSource } from "../../lib/code.js";

const ANIMATES = /@keyframes\s|animation(-name)?\s*:\s*(?!none)[a-z]|\banimate-(spin|ping|pulse|bounce|[a-z-]+)\b|from\s+["'](framer-motion|motion\/react|gsap|animejs|aos|lottie-web|lottie-react|@lottiefiles\/[a-z-]+|react-spring|@react-spring\/web|swiper|embla-carousel[a-z-]*)["']|\bAOS\.init\(|data-aos=/g;
const RESPECTS = /prefers-reduced-motion|useReducedMotion|reducedMotion\s*[:=]|MotionConfig|motion-safe:|motion-reduce:/;

/** @type {import("../../types.js").Check} */
export default {
  id: "a11y.motion",
  layer: "mechanical",
  async run(ctx) {
    const files = ctx.project.files.filter((f) => /\.(css|scss|sass|less|jsx?|tsx?|mjs|vue|svelte|astro|html?)$/.test(f) && !/\.(test|spec|stories)\.|(^|\/)(tests?|docs?|scripts)\//.test(f));
    const hits = await scanSource(ctx.project, ANIMATES, { files, skipComments: true });
    if (!hits.length) return [ctx.pass()];
    for (const f of files) if (RESPECTS.test((await ctx.project.read(f)) ?? "")) return [ctx.pass()];
    const first = hits[0];
    const name = (m) => (/^(@keyframes|animation)/.test(m) ? "CSS animations" : /^animate-/.test(m) ? "Tailwind animate- classes" : /aos/i.test(m) ? "AOS scroll animations" : m.replace(/^from\s+["']|["']$/g, ""));
    const what = [...new Set(hits.map((h) => name(h.match[0].trim())))].slice(0, 4);
    return [ctx.fail({
      key: "site",
      title: "Animations keep playing for people who asked their device to reduce motion",
      impact: "For people with vestibular disorders, migraines or motion sensitivity, moving and sliding content can cause dizziness or nausea; their device setting asks sites to tone it down",
      location: { file: first.file, line: first.line },
      evidence: `animations in ${new Set(hits.map((h) => h.file)).size} file(s) (${what.join(", ")}), and no prefers-reduced-motion anywhere`,
      fix: "Add a reduced-motion rule: @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } } (or MotionConfig reducedMotion=\"user\" with Framer Motion)",
    })];
  },
};
