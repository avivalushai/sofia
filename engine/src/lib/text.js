import { createHash } from "node:crypto";

export function shortHash(s, len = 8) {
  return createHash("sha1").update(s).digest("hex").slice(0, len);
}

/** A stable, readable id fragment. "/" → "home"; anything unusual gets a hash so ids never collide. */
export function slugKey(key) {
  const k = key.replace(/^\/(?=_|$)/, "home").replace(/^\/+/, "") || "home";
  const slug = k.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  // "/" and "#" map to "-" predictably; anything else unusual (or a long key) gets a hash so ids never collide
  const clean = /^[A-Za-z0-9._\/#-]+$/.test(k) && slug.length <= 80;
  return clean ? slug : `${slug.slice(0, 60) || "x"}-${shortHash(key, 6)}`;
}

export function findingId(checkId, key) {
  return `f_${checkId}_${slugKey(key)}`;
}

export function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Damerau–Levenshtein distance, capped: returns max+1 as soon as it's exceeded. */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** 1-based line number of a character offset. */
export function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Runs async tasks with a concurrency limit, keeping results in input order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
