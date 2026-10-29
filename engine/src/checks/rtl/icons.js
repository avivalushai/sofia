// \b doesn't see Hebrew letters as word characters: end the word with a lookahead instead
const FORWARD = /^(הבא|הבאה|המשך|המשיכו|לשלב הבא|קדימה|לעמוד הבא|עוד|לפרטים|קראו עוד|למידע נוסף|next|continue|more|forward|go)(?![\p{L}])/iu;
const BACK = /^(חזרה|חזור|הקודם|הקודמת|לשלב הקודם|אחורה|back|previous|prev)(?![\p{L}])/iu;
const RIGHT = /[→›»⟶➔➜➡]|arrow-?right|chevron-?right|caret-?right|angle-?right|ArrowRight|ChevronRight|navigate_next|keyboard_arrow_right/;
const LEFT = /[←‹«⟵⬅]|arrow-?left|chevron-?left|caret-?left|angle-?left|ArrowLeft|ChevronLeft|navigate_before|keyboard_arrow_left/;

/** Runs in the page: forward/back controls whose arrow points the left-to-right way. */
function scan(src) {
  const [FORWARD, BACK, RIGHT, LEFT] = src.map((s) => new RegExp(s.source, s.flags));
  const mirrored = (el, stop) => {
    for (let a = el; a && a !== stop.parentElement; a = a.parentElement) {
      const t = getComputedStyle(a).transform;
      const m = t && t !== "none" ? t.match(/matrix\(([^,]+),/) : null;
      if (m && Number(m[1]) < 0) return true;
    }
    return false;
  };
  const out = [];
  for (const el of document.querySelectorAll("a, button, [role=button]")) {
    if (getComputedStyle(el).direction !== "rtl" || !window.__lc.isVisible(el)) continue;
    const label = (el.innerText || el.getAttribute("aria-label") || "").replace(/[→›»←‹«⟶⟵➔➜➡⬅]/g, "").trim();
    const forward = FORWARD.test(label);
    const back = BACK.test(label);
    if (!forward && !back) continue;
    // the arrow: a character in the text, or an icon whose name says which way it points
    const icons = [...el.querySelectorAll("svg, i, span, img")].map((i) => ({ i, name: `${i.getAttribute("class") ?? ""} ${i.getAttribute("data-icon") ?? ""} ${i.getAttribute("src") ?? ""} ${i.textContent ?? ""}` }));
    const wrong = forward ? RIGHT : LEFT;
    // an arrow typed as a character: the element that holds that character is the one to check
    let hit = null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n && !hit; n = walker.nextNode()) if (wrong.test(n.textContent)) hit = { i: n.parentElement };
    hit ??= icons.find((x) => wrong.test(x.name));
    if (!hit || mirrored(hit.i, el)) continue;
    out.push({ selector: window.__lc.cssPath(el), label: label.slice(0, 30), forward });
  }
  return out;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "rtl.icons",
  layer: "browser",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.browserPages()) {
      const p = await ctx.browser.open(page.url, { width: 1280 });
      const items = await p.evaluate(scan, [FORWARD, BACK, RIGHT, LEFT].map((r) => ({ source: r.source, flags: r.flags })));
      if (!items.length) continue;
      results.push(ctx.fail({
        key: page.path,
        title: items.length === 1 ? "An arrow points the wrong way for Hebrew" : `${items.length} arrows point the wrong way for Hebrew`,
        impact: "In Hebrew, \"next\" points left and \"back\" points right; arrows copied from an English design make people hesitate about which way they're going",
        location: { url: page.path, viewport: 1280, selector: items[0].selector },
        evidence: items.slice(0, 4).map((i) => `"${i.label}" ${i.forward ? "points right" : "points left"}`).join(", "),
        fix: "Flip directional icons on right-to-left pages (for example transform: scaleX(-1) under [dir=rtl], or Tailwind's rtl:-scale-x-100), or use the opposite arrow",
        shot: await p.screenshot({ highlight: items[0].selector }),
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
