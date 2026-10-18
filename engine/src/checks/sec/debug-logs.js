import { codeKeys, scanSource, stripStrings } from "../../lib/code.js";

const LOG = /console\.(log|debug|info|dir|table)\s*\(([^\n;]*)/g;
const SENSITIVE = /\b(user|users|userData|data|formData|form|token|accessToken|refreshToken|jwt|password|passwd|secret|session|auth|credentials|creds|email|phone|body|payload|req|request|res|response|headers|cookies?|apiKey|card|customer|profile)\b/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.debug-logs",
  layer: "mechanical",
  async run(ctx) {
    const hits = await scanSource(ctx.project, LOG, { skipComments: true });
    const key = codeKeys();
    const results = [];
    for (const { file, line, lineText, match } of hits) {
      const args = stripStrings(match[2]);
      const name = args.match(SENSITIVE)?.[0];
      if (!name) continue;
      results.push(ctx.fail({
        key: key(file, lineText),
        title: "The code prints visitors' details to the console",
        impact: "Personal details or keys end up in browser consoles and server logs, where anyone with access can read them",
        location: { file, line },
        evidence: `${lineText.trim().slice(0, 120)} — logs "${name}"`,
        fix: "Remove the log line, or log only what's needed to debug without personal details",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
