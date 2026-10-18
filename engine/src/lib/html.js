import { parseDocument, DomUtils } from "htmlparser2";

const HIDDEN = new Set(["script", "style", "noscript", "template", "head", "svg", "iframe"]);

export function parseHtml(html) {
  return parseDocument(html, { lowerCaseTags: true, lowerCaseAttributeNames: true });
}

/** @returns {any[]} elements with this tag name, in document order */
export function all(doc, tag) {
  return DomUtils.getElementsByTagName(tag, doc, true);
}

export function first(doc, tag) {
  return all(doc, tag)[0] ?? null;
}

export function attr(el, name) {
  return el?.attribs?.[name];
}

export function textOf(el) {
  return el ? DomUtils.textContent(el).replace(/\s+/g, " ").trim() : "";
}

/** `<meta name=x>` or `<meta property=x>` content, first match. */
export function meta(doc, key) {
  const el = all(doc, "meta").find((m) => attr(m, "name")?.toLowerCase() === key || attr(m, "property")?.toLowerCase() === key);
  return el ? (attr(el, "content") ?? "") : undefined;
}

/**
 * Text a visitor can read: body text without scripts, styles and hidden elements,
 * as separate segments (one per text node) so callers can tell pieces apart.
 * @returns {string[]}
 */
export function visibleSegments(doc) {
  const out = [];
  const walk = (node) => {
    if (node.type === "text") {
      const t = node.data.replace(/\s+/g, " ").trim();
      if (t) out.push(decodeEntities(t));
      return;
    }
    if (node.type === "tag" || node.type === "script" || node.type === "style") {
      if (HIDDEN.has(node.name)) return;
      if (node.attribs && ("hidden" in node.attribs || node.attribs["aria-hidden"] === "true")) return;
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(doc);
  return out;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©" };
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const HEBREW = /[֐-׿]/g;
const LETTER = /\p{L}/gu;

/** Share of letters on the page that are Hebrew (0–1). */
export function hebrewRatio(text) {
  const letters = text.match(LETTER)?.length ?? 0;
  if (!letters) return 0;
  return (text.match(HEBREW)?.length ?? 0) / letters;
}
