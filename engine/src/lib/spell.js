import { loadModule } from "hunspell-asm";
import { editDistance } from "./text.js";

let factoryPromise;
const spellers = new Map();

/** Hunspell (WebAssembly) with the English or Hebrew dictionary, loaded once per process. */
async function speller(lang) {
  if (!spellers.has(lang)) {
    spellers.set(lang, (async () => {
      factoryPromise ??= loadModule();
      const factory = await factoryPromise;
      const { default: dict } = lang === "he" ? await import("dictionary-he") : await import("dictionary-en");
      const aff = factory.mountBuffer(dict.aff, `${lang}.aff`);
      const dic = factory.mountBuffer(dict.dic, `${lang}.dic`);
      return factory.create(aff, dic);
    })());
  }
  return spellers.get(lang);
}

const HEBREW_WORD = /[א-ת]{2,}/g;
const ENGLISH_WORD = /(?<![\p{L}\d@.\/_-])[A-Za-z]+(?:'[a-z]+)?(?![\p{L}\d@\/_-])/gu;

/** Words worth checking: no names, acronyms, abbreviations, code or addresses. */
export function words(segment) {
  const out = [];
  for (const m of segment.matchAll(HEBREW_WORD)) {
    const next = segment[m.index + m[0].length];
    const prev = segment[m.index - 1];
    if (next === '"' || next === "״" || next === "׳" || next === "'" || prev === '"' || prev === "״") continue; // מע״מ, צ'ק
    out.push({ word: m[0], lang: "he" });
  }
  for (const m of segment.matchAll(ENGLISH_WORD)) {
    const w = m[0];
    if (w.length < 3 || /[A-Z]/.test(w)) continue; // names and acronyms
    out.push({ word: w, lang: "en" });
  }
  return out;
}

/**
 * Likely typos across a site's text. Conservative on purpose — a false alarm teaches people to
 * mute the check. A word is flagged only when:
 *  - the dictionary doesn't know it,
 *  - it appears exactly once (repeated unknown words are names or brand terms), and
 *  - a known word one edit away exists (in the dictionary's suggestions or elsewhere on the site).
 * @param {string[]} segments  visible text pieces
 * @returns {Promise<{ word: string, suggestion: string }[]>}
 */
export async function findTypos(segments) {
  const counts = new Map();
  const lang = new Map();
  for (const seg of segments) {
    if (/lorem ipsum/i.test(seg)) continue; // content.placeholders reports that
    for (const { word, lang: l } of words(seg)) {
      const key = l === "en" ? word.toLowerCase() : word;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      lang.set(key, l);
    }
  }
  const typos = [];
  const siteWords = [...counts.keys()];
  for (const [word, n] of [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (n !== 1) continue;
    const s = await speller(lang.get(word));
    if (s.spell(word)) continue;
    const near = siteWords.find((w) => w !== word && counts.get(w) > 1 && lang.get(w) === lang.get(word) && editDistance(w, word, 1) <= 1);
    const suggestion = near ?? s.suggest(word).find((x) => editDistance(x, word, 1) <= 1 && !/[\s-]/.test(x));
    if (suggestion) typos.push({ word, suggestion });
  }
  return typos;
}
