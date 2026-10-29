import { codeKeys } from "../../lib/code.js";

const SESSIONISH = /sess|token|auth|jwt|sid\b|login|user/i;
// server code that sets a cookie: Next cookies().set, Express res.cookie, the cookie package, raw Set-Cookie
const SETTERS = /cookies\(\)\s*\.set\(|\bcookies\.set\(|\bres\.cookie\(|\bserialize\(|\bsetCookie\(|["']Set-Cookie["']/g;
const BROWSER_SET = /document\.cookie\s*=\s*([^;\n]*)/g;

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.cookies",
  layer: "mechanical",
  async run(ctx) {
    const key = codeKeys();
    const results = [];
    const files = ctx.project.files.filter((f) => /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(f) && !/\.(test|spec)\./.test(f));
    for (const file of files) {
      const text = await ctx.project.read(file);
      if (!text) continue;
      const lines = text.split("\n");
      for (const [i, line] of lines.entries()) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        SETTERS.lastIndex = 0;
        BROWSER_SET.lastIndex = 0;
        const browserSet = BROWSER_SET.exec(line);
        if (browserSet && SESSIONISH.test(browserSet[1])) {
          results.push(ctx.fail({
            key: key(file, line),
            title: "The login cookie is set by page code, so any script on the page can read it",
            impact: "If any script on your site is ever compromised (an ad, a widget, a bug), it can copy visitors' login and sign in as them",
            location: { file, line: i + 1 },
            evidence: `${line.trim().slice(0, 120)}`,
            fix: "Set the login cookie from the server with HttpOnly, Secure and SameSite=Lax, and stop writing it from the browser",
          }));
          continue;
        }
        if (!SETTERS.test(line)) continue;
        // the cookie's options are usually on this line or the next few
        const around = lines.slice(i, i + 8).join("\n");
        if (!SESSIONISH.test(around)) continue;
        const missing = [
          !/httpOnly\s*:\s*true|HttpOnly/i.test(around) && "HttpOnly",
          !/secure\s*:\s*(true|process|isProd|prod)|;\s*Secure/i.test(around) && "Secure",
          !/sameSite\s*:|SameSite=/i.test(around) && "SameSite",
        ].filter(Boolean);
        if (!missing.length) continue;
        results.push(ctx.fail({
          key: key(file, line),
          title: "A login cookie is missing its safety settings",
          impact: missing.includes("HttpOnly")
            ? "Any script on the page can read visitors' login, so one compromised script is enough to take over accounts"
            : "The login can travel over insecure connections or be sent along by other sites, which makes accounts easier to hijack",
          location: { file, line: i + 1 },
          evidence: `${line.trim().slice(0, 100)} — no ${missing.join(", ")}`,
          fix: `Add ${missing.map((m) => (m === "SameSite" ? "sameSite: \"lax\"" : `${m[0].toLowerCase()}${m.slice(1)}: true`)).join(", ")} to this cookie's options`,
        }));
      }
    }
    // auth libraries (NextAuth, Clerk, Supabase…) set their own cookies with the right flags
    return results.length ? results : [ctx.pass()];
  },
};
