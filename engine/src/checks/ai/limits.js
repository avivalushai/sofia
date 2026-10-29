import { codeKeys } from "../../lib/code.js";

// a call to a model: the provider SDKs and their HTTP endpoints
const CALL = /(chat\.completions\.create|responses\.create|messages\.create|generateText|streamText|generateObject|streamObject|generateContent|\.invoke\(|\.chat\(|api\.openai\.com\/v1\/(chat\/completions|responses)|api\.anthropic\.com\/v1\/messages|generativelanguage\.googleapis\.com)/;
const MAX_LEN = /max_tokens|maxTokens|max_output_tokens|maxOutputTokens|max_completion_tokens|maxCompletionTokens|maxLength/;
const TIMEOUT = /timeout|AbortSignal\.timeout|signal\s*:|maxDuration|abortSignal/;

/** @type {import("../../types.js").Check} */
export default {
  id: "ai.limits",
  layer: "mechanical",
  async run(ctx) {
    const key = codeKeys();
    const results = [];
    for (const f of ctx.project.files.filter((f) => /\.(jsx?|tsx?|mjs|cjs|py)$/.test(f) && !/\.(test|spec)\./.test(f))) {
      const text = (await ctx.project.read(f)) ?? "";
      const lines = text.split("\n");
      for (const [i, line] of lines.entries()) {
        if (!CALL.test(line) || /^\s*(\/\/|\*|#)/.test(line)) continue;
        // the call's options are usually on this line and the next 15; a client-wide timeout counts too
        const around = lines.slice(Math.max(0, i - 2), i + 16).join("\n");
        const missing = [!MAX_LEN.test(around) && "maximum answer length", !TIMEOUT.test(around) && !/new\s+(OpenAI|Anthropic)\([^)]*timeout/.test(text) && "time limit"].filter(Boolean);
        if (!missing.length) continue;
        results.push(ctx.fail({
          key: key(f, line),
          title: "A call to the AI model has no limits",
          impact: missing.includes("maximum answer length")
            ? "Without a length cap one answer can run to thousands of words: slow for the visitor and billed by the word to you"
            : "Without a time limit a slow or stuck model leaves the visitor waiting with a spinner, and the server's request open until the host kills it",
          location: { file: f, line: i + 1 },
          evidence: `${line.trim().slice(0, 100)} has no ${missing.join(" and no ")}`,
          fix: "Set the answer length and a time limit on every call",
          options: [
            { label: "Cap the length and the wait (recommended)", detail: "For example max_tokens 800 and a 30-second timeout, with a friendly message when it runs out" },
            { label: "Stream the answer and cap the length", detail: "The visitor sees text right away; still capped so it can't run on" },
            { label: "Keep it as it is", detail: "Only if every call is tiny and internal" },
          ],
        }));
      }
    }
    return results.length ? results : [ctx.pass()];
  },
};
