import { parseColor } from "../../lib/color.js";

const luminance = (c) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Runs in the page: the page's own background, big areas still light, and text that got hard to read. */
function measure() {
  const opaque = (c) => c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c);
  const bgOf = (el) => {
    for (let a = el; a; a = a.parentElement) {
      const c = getComputedStyle(a).backgroundColor;
      if (opaque(c)) return c;
    }
    return "rgb(255, 255, 255)";
  };
  const pageBg = bgOf(document.body);
  const area = window.innerWidth * window.innerHeight;
  const patches = [];
  const texts = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (!window.__lc.isVisible(el)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (opaque(s.backgroundColor) && r.width * r.height > area * 0.05 && !/^(img|video|canvas|svg|iframe|picture)$/.test(el.localName) && s.backgroundImage === "none") {
      patches.push({ selector: window.__lc.cssPath(el), bg: s.backgroundColor, share: (r.width * Math.min(r.height, window.innerHeight)) / area });
    }
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ");
    if (own.length > 1) texts.push({ selector: window.__lc.cssPath(el), color: s.color, bg: bgOf(el), sample: own.slice(0, 40) });
  }
  return { pageBg, patches, texts };
}

/** Sites that switch with a class or a saved choice instead of the system setting. */
async function forceDark(page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["theme", "color-theme", "colorMode", "chakra-ui-color-mode", "mantine-color-scheme-value", "vueuse-color-scheme", "nuxt-color-mode"]) localStorage.setItem(k, "dark");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.style.colorScheme = "dark";
    });
  });
}

/** @type {import("../../types.js").Check} */
export default {
  id: "design.dark-mode",
  layer: "browser",
  async run(ctx) {
    const results = [];
    let switched = 0;
    for (const page of await ctx.crawl.browserPages()) {
      const found = await ctx.browser.fresh(page.url, { width: 1280, context: { colorScheme: "dark" }, beforeGoto: forceDark }, async (p) => {
        const m = await p.evaluate(measure);
        const pageBg = parseColor(m.pageBg);
        if (!pageBg || luminance(pageBg) > 0.4) return null; // this page has no dark version
        const light = m.patches.filter((x) => {
          const c = parseColor(x.bg);
          return c && c.a > 0.9 && luminance(c) > 0.7;
        }).sort((a, b) => b.share - a.share);
        // colours that clearly didn't switch: far below the contrast minimum, not borderline
        const faint = m.texts.filter((t) => {
          const fg = parseColor(t.color);
          const bg = parseColor(t.bg);
          return fg && bg && ratio(fg, bg) < 2.5;
        });
        const first = (light[0] ?? faint[0])?.selector;
        return { light, faint, shot: first ? await p.screenshot({ highlight: first }) : null };
      });
      if (!found) continue;
      switched++;
      const { light, faint } = found;
      if (!light.length && !faint.length) continue;
      results.push(ctx.fail({
        key: page.path,
        title: light.length ? "Parts of the page stay bright in dark mode" : "Some text becomes hard to read in dark mode",
        impact: light.length
          ? "People who use dark mode get a dark page with glaring white blocks, which is uncomfortable at night and looks broken"
          : "Text whose colour didn't switch nearly disappears against the dark background",
        location: { url: page.path, viewport: 1280, selector: (light[0] ?? faint[0]).selector },
        evidence: [
          ...light.slice(0, 2).map((x) => `${x.selector} keeps a light background (${x.bg}) over ${Math.round(x.share * 100)}% of the screen`),
          ...faint.slice(0, 3).map((t) => `"${t.sample}" is ${t.color} on ${t.bg}`),
        ].join("; "),
        fix: "Give these parts dark-mode colours too (the same dark: classes or dark variables the rest of the page uses)",
        shot: found.shot,
      }));
    }
    if (!switched) {
      return [ctx.uncertain({
        key: "site",
        title: "Couldn't switch the site to dark mode",
        evidence: "with the system set to dark, a dark class and a saved dark theme, every page stayed light. If dark mode needs a toggle on the page, check it by hand",
      })];
    }
    return results.length ? results : [ctx.pass()];
  },
};
