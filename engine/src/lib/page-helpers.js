/**
 * Helpers installed in every page as window.__lc (via addInitScript).
 * Runs inside the browser, so it can't use anything from Node.
 */
function install() {
  if (window.__lc) return;
  const HIGHLIGHT_ID = "__lc-highlight";

  function cssPath(el) {
    if (!(el instanceof Element)) return null;
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && document.querySelectorAll(`#${el.id}`).length === 1) return `#${el.id}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.localName;
      const classes = [...node.classList].filter((c) => /^[A-Za-z][\w-]*$/.test(c) && !c.startsWith("__lc")).slice(0, 2);
      if (classes.length) part += `.${classes.join(".")}`;
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.localName === node.localName);
        if (same.length > 1 && !(classes.length && parent.querySelectorAll(`:scope > ${part}`).length === 1)) {
          part += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
        parts[0] = `#${node.id}`;
        break;
      }
      const candidate = parts.join(" > ");
      if (document.querySelectorAll(candidate).length === 1) return candidate;
      node = parent;
    }
    return parts.join(" > ");
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  let savedScroll = null;
  function highlight(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    savedScroll = [window.scrollX, window.scrollY];
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    const box = document.createElement("div");
    box.id = HIGHLIGHT_ID;
    Object.assign(box.style, {
      // document coordinates: "fixed" lands in the wrong place on right-to-left pages that scroll sideways
      position: "absolute", left: `${r.left + window.scrollX - 4}px`, top: `${r.top + window.scrollY - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px`,
      outline: "3px solid #e11d48", boxShadow: "0 0 0 9999px rgba(0,0,0,0.12)", zIndex: "2147483647", pointerEvents: "none", borderRadius: "4px",
    });
    document.documentElement.appendChild(box);
    return true;
  }

  function unhighlight() {
    document.getElementById(HIGHLIGHT_ID)?.remove();
    // put the page back where it was, so other checks measure the same page
    if (savedScroll) window.scrollTo(savedScroll[0], savedScroll[1]);
    savedScroll = null;
  }

  /** Counts DOM changes from now on, ignoring our own highlight box. */
  function watchMutations() {
    window.__lcMutations = 0;
    const obs = new MutationObserver((list) => {
      for (const m of list) if (!(m.target.id === HIGHLIGHT_ID)) window.__lcMutations++;
    });
    obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    return true;
  }

  function visibleText() {
    return (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
  }

  window.__lc = { cssPath, isVisible, highlight, unhighlight, watchMutations, visibleText };
}

export const PAGE_HELPERS = `(${install.toString()})();`;
