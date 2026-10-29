/**
 * Runs in the page: elements that stay on screen while the page scrolls (position fixed or sticky),
 * visible, and not a cookie/consent banner (those are meant to be dismissed).
 */
export function fixedElements() {
  const out = [];
  for (const el of document.body.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") continue;
    if (!window.__lc.isVisible(el)) continue;
    // only the outermost one
    let inner = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const p = getComputedStyle(a).position;
      if (p === "fixed" || p === "sticky") inner = true;
    }
    if (inner) continue;
    const text = (el.innerText || "").slice(0, 400);
    if (/cookie|consent|עוגיות|privacy|פרטיות/i.test(text) && el.querySelector("button, a")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    // a full-screen overlay is a menu or a modal, not a floating element
    if (r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2) continue;
    out.push({ selector: window.__lc.cssPath(el), position: cs.position, top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width });
  }
  return out;
}
