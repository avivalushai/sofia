import { loadModule } from "hunspell-asm";
import { DictionaryUnavailable, hebrewDictionary } from "./hebrew-dictionary.js";
import { editDistance } from "./text.js";

let factoryPromise;
const spellers = new Map();

/** Hunspell (WebAssembly) with the English or Hebrew dictionary, loaded once per process. */
async function speller(lang, options = {}) {
  if (!spellers.has(lang)) {
    spellers.set(lang, (async () => {
      factoryPromise ??= loadModule();
      const factory = await factoryPromise;
      // Hebrew is downloaded on first use, and only for apps with Hebrew text (see hebrew-dictionary.js)
      const dict = lang === "he" ? await hebrewDictionary(options) : (await import("dictionary-en")).default;
      const aff = factory.mountBuffer(dict.aff, `${lang}.aff`);
      const dic = factory.mountBuffer(dict.dic, `${lang}.dic`);
      return factory.create(aff, dic);
    })());
    // a failed download can be tried again next time
    spellers.get(lang).catch(() => spellers.delete(lang));
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
 * @param {{ onDownload?: (msg: string) => void, unavailable?: string[] }} [o]  unavailable collects why a language couldn't be checked
 * @returns {Promise<{ word: string, suggestion: string }[]>}
 */
export async function findTypos(segments, { onDownload, unavailable = [] } = {}) {
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
  const repeated = siteWords.filter((w) => counts.get(w) > 1 && lang.get(w) === "he").map(stripPrefixes);
  for (const [word, n] of [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (n !== 1) continue;
    let s;
    try {
      s = await speller(lang.get(word), { onDownload });
    } catch (e) {
      if (!(e instanceof DictionaryUnavailable)) throw e;
      // no Hebrew dictionary on this machine: Hebrew words are left unchecked, and the caller says so
      if (!unavailable.includes(e.message)) unavailable.push(e.message);
      continue;
    }
    if (s.spell(word)) continue;
    const near = siteWords.find((w) => w !== word && counts.get(w) > 1 && lang.get(w) === lang.get(word) && editDistance(w, word, 1) <= 1);
    if (lang.get(word) === "he") {
      // The Hebrew dictionary misses many valid forms (prefixes, loanwords, spelling with or without
      // ו/י) and its suggestions are unreliable, so only two strong signals count:
      if (knownStem(word, repeated)) continue; // a form of a name or term the site repeats (נהוראי → הנהוראים)
      if (near && !differsOnlyAtStart(word, near)) {
        typos.push({ word, suggestion: near }); // spelled differently from the site's own repeated word
        continue;
      }
      const fixedDouble = undoubled(word).find((w) => s.spell(w)); // a stuck key: שלחח → שלח
      if (fixedDouble) typos.push({ word, suggestion: fixedDouble });
      continue;
    }
    const suggestion = near ?? s.suggest(word).find((x) => editDistance(x, word, 1) <= 1 && !/[\s-]/.test(x));
    if (suggestion) typos.push({ word, suggestion });
  }
  return typos;
}

const PREFIXES = /^(?:ו?(?:ש|כש|מש|לכש)?(?:ה|ב|ל|כ|מ)?)/;

function stripPrefixes(w) {
  const stripped = w.replace(PREFIXES, "");
  return stripped.length >= 3 ? stripped : w;
}

/** Shares a stem of 4+ letters with a Hebrew word the site uses more than once. */
function knownStem(word, repeated) {
  const stem = stripPrefixes(word);
  return stem.length >= 4 && repeated.some((r) => r.length >= 4 && (stem.startsWith(r.slice(0, Math.max(4, r.length - 1))) || r.startsWith(stem.slice(0, Math.max(4, stem.length - 1)))));
}

/** The two words differ only in their first letter (a different prefix: בפארק / הפארק / פארק). */
function differsOnlyAtStart(a, b) {
  if (a.slice(1) === b.slice(1)) return true;
  return a.slice(1) === b || b.slice(1) === a;
}

/** The word with each doubled letter written once. */
function undoubled(word) {
  const out = [];
  for (let i = 1; i < word.length; i++) if (word[i] === word[i - 1]) out.push(word.slice(0, i) + word.slice(i + 1));
  return out;
}
