import { lineAt, shortHash } from "./text.js";

const COMMENT_LINE = /^\s*(\/\/|\*|\/\*|#|<!--)/;

/**
 * Finds a regex in source files, line by line.
 * @param {any} project
 * @param {RegExp} re  global regex
 * @param {{ files?: string[], skipComments?: boolean }} [o]
 * @returns {Promise<{ file: string, line: number, lineText: string, match: RegExpMatchArray }[]>}
 */
export async function scanSource(project, re, { files = project.shippedSource(), skipComments = false } = {}) {
  const hits = [];
  for (const file of files) {
    const text = await project.read(file);
    if (!text) continue;
    for (const match of text.matchAll(re)) {
      const line = lineAt(text, match.index);
      const lineText = text.split("\n")[line - 1] ?? "";
      if (skipComments && COMMENT_LINE.test(lineText)) continue;
      hits.push({ file, line, lineText, match });
    }
  }
  return hits;
}

/**
 * A finding key for a line of code that survives edits elsewhere in the file:
 * file + hash of the trimmed line, with #2, #3 for repeats.
 */
export function codeKeys() {
  const seen = new Map();
  return (file, lineText) => {
    const base = `${file}#${shortHash(lineText.trim(), 6)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

/** Strips string literals so only identifiers remain. */
export function stripStrings(code) {
  return code.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
}
