import { codeKeys } from "../../lib/code.js";

const ANY = /["']Access-Control-Allow-Origin["']\s*[,:]\s*["']\*["']|origin\s*:\s*(["']\*["']|true)\b/i;
const REFLECT = /["']Access-Control-Allow-Origin["']\s*[,:]\s*(req|request)\.headers(\.get\(\s*["']origin["']\s*\)|\.origin|\[["']origin["']\])/i;
const CREDENTIALS = /Access-Control-Allow-Credentials["']\s*[,:]\s*["']?true|credentials\s*:\s*true/i;
const BARE_CORS = /\bcors\(\s*\)/;
// code that knows who is asking: their data is what another site would read
const USER_DATA = /session|cookie|getUser|currentUser|auth\(|getServerSession|req\.user|userId|token|supabase\.auth/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.cors",
  layer: "mechanical",
  async run(ctx) {
    const key = codeKeys();
    const results = [];
    const files = ctx.project.files.filter((f) => /\.(js|ts|mjs|cjs|jsx|tsx|json|toml)$/.test(f) && !/\.(test|spec)\.|package(-lock)?\.json$|tsconfig/.test(f) && !/^(src\/)?(components|assets|styles)\//.test(f));
    for (const file of files) {
      const text = await ctx.project.read(file);
      if (!text || !/Access-Control-Allow-Origin|cors\(/i.test(text)) continue;
      const lines = text.split("\n");
      const credentials = CREDENTIALS.test(text);
      const userData = USER_DATA.test(text) || /\.(json|toml)$/.test(file);
      for (const [i, line] of lines.entries()) {
        if (/^\s*(\/\/|\*|#)/.test(line)) continue;
        const reflect = REFLECT.test(line) && credentials;
        const open = (ANY.test(line) || BARE_CORS.test(line)) && userData;
        if (!reflect && !open) continue;
        results.push(ctx.fail({
          key: key(file, line),
          title: reflect ? "Any website can read your visitors' private data through your API" : "Your API answers any website that asks",
          impact: reflect
            ? "A page on any other site can quietly ask your API for a signed-in visitor's data, with their login, and read the answer"
            : "Other sites can call your API from their pages and read what it returns, including anything tied to the person visiting",
          location: { file, line: i + 1 },
          evidence: `${line.trim().slice(0, 120)}${reflect ? " — copies the caller's address back and allows logins" : ""}`,
          fix: "Allow only your own site's address (for example https://yoursite.com) instead of every origin",
        }));
      }
    }
    if (results.length || ctx.isLocalTarget) return results.length ? results : [ctx.pass()];
    // live: one ordinary request with another site's address, the way a browser would send it
    const res = await ctx.http.request(ctx.target, { headers: { origin: "https://sofia-cors-check.example" }, as: "none" });
    if (/sofia-cors-check\.example/.test(res.headers["access-control-allow-origin"] ?? "") && /true/i.test(res.headers["access-control-allow-credentials"] ?? "")) {
      return [ctx.fail({
        key: "site",
        title: "Any website can read your visitors' private data through your site",
        impact: "A page on any other site can ask your site for a signed-in visitor's data, with their login, and read the answer",
        location: { url: "/" },
        evidence: "a request from another site's address got that address back in Access-Control-Allow-Origin, with Allow-Credentials: true",
        fix: "Allow only your own site's address instead of copying back whoever asks",
      })];
    }
    return [ctx.pass()];
  },
};
