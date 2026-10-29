import { lineAt } from "./text.js";

/**
 * Form fields as written in the source (HTML, JSX, Vue, Svelte), so apps that build their pages in
 * the browser are covered too. Regex-level: good enough for attributes, not for logic.
 */

const TAG = /<(input|textarea|select|form|button)\b((?:[^>"'{}]|"[^"]*"|'[^']*'|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*?)\/?>/gis;
const ATTR = /([a-zA-Z_:@][\w:.-]*)(?:\s*=\s*("[^"]*"|'[^']*'|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[^\s>]+))?/g;

/** Attribute map with lowercased names; JSX values in braces keep their braces. */
export function attrsOf(src) {
  const out = {};
  for (const m of src.matchAll(ATTR)) {
    const raw = m[2] ?? "";
    out[m[1].toLowerCase()] = /^["']/.test(raw) ? raw.slice(1, -1) : raw;
  }
  return out;
}

const literal = (v) => (v && /^\{\s*["'`]([^"'`]*)["'`]\s*\}$/.test(v) ? v.match(/^\{\s*["'`]([^"'`]*)["'`]\s*\}$/)[1] : v);

const KINDS = [
  { kind: "email", re: /e-?mail|אימייל|מייל|דוא"?ל/i },
  { kind: "tel", re: /phone|\btel\b|mobile|cell|whatsapp|טלפון|נייד|פלאפון|וואטסאפ/i },
  { kind: "name", re: /^(full[\s_-]?)?name$|first[\s_-]?name|last[\s_-]?name|fname|lname|given|family|surname|full[\s_-]?name|your name|^שם( מלא| פרטי| משפחה)?$|שם מלא|שם פרטי|שם משפחה/i },
  { kind: "number", re: /\b(age|quantity|qty|amount|guests|people|count)\b|גיל|כמות|מספר משתתפים|מספר אורחים/i },
];

/** Hidden from people (a bot trap, or filled in by code). */
export const hiddenField = (a) => "hidden" in a || /^(true|\{true\})$/.test(a["aria-hidden"] ?? "") || /^(-1|\{-1\})$/.test(a.tabindex ?? "") || /display:\s*["']?none/i.test(a.style ?? "");

/** What a field is for, from its name, id, placeholder and label — or null. */
export function fieldKind(a, label = "") {
  const type = (literal(a.type) ?? "text").toLowerCase();
  if (["hidden", "submit", "button", "reset", "image", "checkbox", "radio", "file", "range", "color", "date", "time", "datetime-local", "month", "week"].includes(type)) return null;
  if (hiddenField(a)) return null;
  if (type === "password") return "password";
  if (type === "search" || /^(q|query|search)$/i.test(literal(a.name) ?? "")) return "search";
  const words = [a.name, a.id, a.placeholder, a["aria-label"], label].map(literal).filter((v) => v && !/^\{/.test(v)).join(" ");
  if (/user\s*name|username|שם משתמש/i.test(words)) return "username";
  return KINDS.find((k) => k.re.test(words) || k.re.test(literal(a.name) ?? ""))?.kind ?? null;
}

/**
 * @returns {Promise<{ file: string, forms: { line: number, attrs: any, fields: { tag: string, line: number, attrs: any, kind: string|null, text: string }[], buttons: any[], body: string }[] }[]>}
 */
export async function sourceForms(project) {
  const out = [];
  for (const file of project.shippedSource()) {
    const text = await project.read(file);
    if (!text || !/<(form|input|textarea)\b/i.test(text)) continue;
    const forms = [];
    let current = null;
    const close = /<\/form>/gi;
    const closes = [...text.matchAll(close)].map((m) => m.index);
    for (const m of text.matchAll(TAG)) {
      const tag = m[1].toLowerCase();
      const attrs = attrsOf(m[2]);
      const line = lineAt(text, m.index);
      if (current && closes.some((c) => c > current.start && c < m.index)) current = null;
      if (tag === "form") {
        const end = closes.find((c) => c > m.index) ?? text.length;
        current = { start: m.index, line, attrs, fields: [], buttons: [], body: text.slice(m.index, end) };
        forms.push(current);
        continue;
      }
      if (!current) {
        // fields outside any <form> (common in React): group them per file as one "form"
        current = { start: m.index, line, attrs: {}, fields: [], buttons: [], body: text, loose: true };
        forms.push(current);
      }
      if (tag === "button") current.buttons.push({ line, attrs });
      else {
        const before = text.slice(Math.max(0, m.index - 160), m.index);
        // the text just before the field, if nothing closes in between (a label wrapping the field)
        const label = (before.match(/>([^<>{}]{2,40})\s*(?:<(?!\/)[^>]*>\s*)*$/)?.[1] ?? "").trim();
        current.fields.push({ tag, line, attrs, kind: tag === "select" ? null : fieldKind(attrs, label), text: m[0] });
      }
    }
    const real = forms.filter((f) => f.fields.length);
    if (real.length) out.push({ file, forms: real });
  }
  return out;
}

/** A field a person types into (not hidden, not a checkbox). */
export const typed = (f) => !hiddenField(f.attrs) && (f.tag === "textarea" || (f.tag === "input" && !["hidden", "submit", "button", "reset", "image", "checkbox", "radio", "file", "range", "color"].includes((literal(f.attrs.type) ?? "text").toLowerCase())));

/** Login, search and one-field filters aren't the forms these checks are about. */
export const isLoginOrSearch = (form) => form.fields.some((f) => f.kind === "password" || f.kind === "search") || form.attrs.role === "search";

export { literal };
