/** "rgb(51, 51, 51)" / "rgba(0, 0, 0, 0.5)" → { r, g, b, a } or null */
export function parseColor(s) {
  const m = s?.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
  if (!m) return null;
  const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a };
}

export function hex({ r, g, b }) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** sRGB → CIE Lab (D65), for perceptual distances. */
export function lab({ r, g, b }) {
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

/** CIE76 colour difference: under ~2 most people can't tell two colours apart. */
export function deltaE(c1, c2) {
  const p = lab(c1);
  const q = lab(c2);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

export function isGray({ r, g, b }) {
  return Math.max(r, g, b) - Math.min(r, g, b) <= 12;
}

/**
 * Groups colours closer than `threshold` (single linkage).
 * @param {{ r: number, g: number, b: number }[]} colors distinct colours
 * @returns {typeof colors[]} clusters, each sorted by hex
 */
export function cluster(colors, threshold) {
  const parent = colors.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      if (deltaE(colors[i], colors[j]) < threshold) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  colors.forEach((c, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(c);
  });
  return [...groups.values()].map((g) => g.sort((a, b) => (hex(a) < hex(b) ? -1 : 1)));
}
