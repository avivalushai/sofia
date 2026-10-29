import { scanSource } from "../../lib/code.js";

const TOOLS = [
  { name: "Hotjar", re: /static\.hotjar\.com|hotjar\.com\/c\/hotjar|["']@hotjar\/browser["']|hj\(\s*["']/, masked: /data-hj-suppress|data-hj-allow|hj-suppress/ },
  { name: "Microsoft Clarity", re: /clarity\.ms\/tag|["']@microsoft\/clarity["']/, masked: /data-clarity-mask|clarity\(\s*["']set["']/ },
  { name: "LogRocket", re: /["']logrocket["']|cdn\.logrocket/, masked: /inputSanitizer\s*:\s*true|textSanitizer\s*:\s*true|data-private/ },
  { name: "FullStory", re: /fullstory\.com\/s\/fs\.js|["']@fullstory\/browser["']/, masked: /fs-exclude|fs-mask|fs-unmask/ },
  { name: "PostHog recordings", re: /["']posthog-js["']|posthog\.init\(/, masked: /maskAllInputs\s*:\s*true|ph-no-capture|maskTextSelector/, onlyIf: /session_recording|disable_session_recording\s*:\s*false|recordCrossOriginIframes|sessionRecording/ },
  { name: "Mouseflow", re: /cdn\.mouseflow\.com/, masked: /data-mf-replace|mouseflow-mask/ },
  { name: "Smartlook", re: /web-sdk\.smartlook\.com|["']smartlook-client["']/, masked: /data-recording-disable|smartlook\(\s*["']record["']/ },
];
const SENSITIVE_FIELD = /type=["']password["']|name=["'](card|cc|cvv|cvc|id_?number|teudat|ת"?ז|ssn|iban|account)|autocomplete=["']cc-|תעודת זהות|מספר כרטיס/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "privacy.session-replay",
  layer: "mechanical",
  async run(ctx) {
    const files = ctx.project.files.filter((f) => /\.(jsx?|tsx?|mjs|html?|vue|svelte|astro)$/.test(f) && !/\.(test|spec)\./.test(f));
    const texts = [];
    for (const f of files) texts.push({ f, t: (await ctx.project.read(f)) ?? "" });
    for (const p of await ctx.crawl.pages()) texts.push({ f: null, t: p.html, path: p.path });
    const all = texts.map((x) => x.t).join("\n");
    const used = TOOLS.filter((tool) => tool.re.test(all) && (!tool.onlyIf || tool.onlyIf.test(all)));
    if (!used.length) return [ctx.pass()];
    const sensitive = texts.filter((x) => SENSITIVE_FIELD.test(x.t));
    const results = [];
    for (const tool of used) {
      if (tool.masked.test(all)) continue;
      const where = texts.find((x) => tool.re.test(x.t));
      results.push(ctx.fail({
        key: tool.name,
        title: `${tool.name} may record what people type`,
        impact: `Session recordings of pages with ${sensitive.length ? "passwords, card numbers or ID numbers" : "forms"} can capture what visitors type and send it to ${tool.name}'s servers, a privacy breach under Israeli law and GDPR`,
        location: where?.f ? { file: where.f } : { url: where?.path ?? "/" },
        evidence: `${tool.name} is loaded and nothing in the code tells it to mask fields${sensitive.length ? `; sensitive fields in ${sensitive.slice(0, 3).map((x) => x.f ?? x.path).join(", ")}` : ""}`,
        fix: `Turn on input masking in ${tool.name}'s settings (and its code options), and mark sensitive areas to be excluded from recordings`,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
