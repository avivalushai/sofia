import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { STATE_DIR } from "./state.js";

/**
 * Judgment checks (docs/02, docs/03): the engine doesn't judge them. It prepares a review task — the
 * rubric and the files worth reading — and a separate reviewer answers each rubric question with a
 * quote from the code. Quotes are verified here before anything reaches the report.
 */

export const PAGES_FILE = `${STATE_DIR}/review/pages.txt`;
const MAX_FILES = 15;

const SERVER_PATH = /(^|\/)(app\/api|pages\/api|api|server|functions|supabase\/functions|netlify\/functions|routes\/api|actions)\//;
const SERVER_CODE = /["']use server["']|export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=|app\.(get|post|put|delete)\(|router\.(get|post|put|delete)\(/;
const PAID_CALL = /openai|anthropic|generativelanguage|api\.groq|replicate|resend|sendgrid|nodemailer|twilio|postmark|mailgun|stripe|mapbox|elevenlabs|deepgram|fal\.ai|stability/i;

/** Which files each judgment check should start from, and whether it needs the pages' visible text. */
const SOURCES = {
  "leftover.mock-data": { pages: true, match: (t) => /mock|fake|dummy|sample(Data)?|testimonials?|reviews?\s*[:=]\s*\[|faker|\b\d{1,3}(,\d{3})+\+?\s*(happy|customers|users|clients|downloads|לקוחות|משתמשים)|name:\s*["'][A-Z][a-z]+ [A-Z][a-z]+["']/i.test(t) },
  // every file with event handlers: a toggle that only sets a variable looks like any other handler
  "leftover.unwired-ui": { match: (t) => /on(Click|Submit|Change|Toggle)\s*=|addEventListener\(|@click=|on:click=/.test(t) },
  "qa.empty-states": { match: (t) => /\.map\(\s*\(?\s*\w+|v-for=|\{#each\b/.test(t) && /useState|fetch\(|useQuery|useSWR|axios|supabase|await\s|\.json\(\)/.test(t) },
  "content.terms": { pages: true, match: () => false },
  "sec.server-authz": { server: true, match: (t, f) => SERVER_PATH.test(f) || SERVER_CODE.test(t) || /(^|\/)middleware\.[jt]s$|\.rules$|supabase\/migrations\//.test(f) },
  "sec.rate-limit": { server: true, match: (t, f) => (SERVER_PATH.test(f) || SERVER_CODE.test(t) || /(^|\/)middleware\.[jt]s$/.test(f)) && (PAID_CALL.test(t) || /ratelimit|rate-limit|rateLimit/i.test(t)) },
  "sec.xss-output": { match: (t) => /dangerouslySetInnerHTML|\.innerHTML\s*[+]?=|insertAdjacentHTML|outerHTML\s*=|document\.write\(|v-html=|\{@html|marked\(|markdown-it|rehype-raw|location\.(search|hash)|URLSearchParams|useSearchParams|href=\{/.test(t) },
  "sec.login-limit": { server: true, match: (t, f) => /bcrypt|argon2|scrypt|pbkdf2|CredentialsProvider|Credentials\(|password|signIn|login|otp|verify-?code|reset/i.test(t) && (SERVER_PATH.test(f) || SERVER_CODE.test(t) || /(^|\/)(auth|lib)\//.test(f)) },
  "forms.thank-you": { match: (t) => /onSubmit|addEventListener\(\s*["']submit|<form\b|handleSubmit|action=\{/.test(t) },
  "data.delete-export": { pages: true, match: (t, f) => /account|settings|profile|delete|remove|export|download|חשבון|הגדרות|פרופיל|מחיקה|ייצוא/i.test(f) || ((SERVER_PATH.test(f) || SERVER_CODE.test(t)) && /user|account|profile/i.test(t)) || /deleteUser|auth\.admin\.deleteUser|delete-?account|export-?data/i.test(t) },
  "content.button-labels": { pages: true, match: (t) => /<button|<Button|role=["']button|type=["']submit|<a\s[^>]*href/i.test(t) },
  "content.error-copy": { match: (t) => /\.catch\(|catch\s*\(|toast\.error|setError|showError|alert\(|\berror\s*[:=]|errors?\.[a-z]+\s*=|!res\.ok|res\.status\((4|5)\d\d\)|שגיאה|נכשל/i.test(t) },
  // Next's not-found, Astro/Gatsby/Next pages 404, SvelteKit +error, Nuxt error.vue, React Router NotFound
  "content.404-copy": { match: (t, f) => /(^|\/)(404|not-found|NotFound|\+error)\.(html?|jsx?|tsx?|vue|svelte|astro|mdx?)$|(^|\/)error\.vue$/.test(f) },
  "shop.vat": { match: (t) => /\bvat\b|מע"?מ|מע״מ|\btax(es|Rate)?\b|shipping|משלוח|subtotal|unit_amount|total\s*[=:]|price\s*\*/i.test(t) && /price|amount|total|cart|checkout|סכום|מחיר/i.test(t) },
  "privacy.policy-matches": { pages: true, any: true, match: (t, f) => /privacy|פרטיות/i.test(f) || /<form|<input|gtag\(|fbq\(|posthog|hotjar|clarity|mixpanel|segment|intercom|crisp|tawk|resend|sendgrid|stripe|supabase|firebase|openai|anthropic|track\(|identify\(/i.test(t) },
  "privacy.licenses": { any: true, match: (t, f) => /@font-face|fonts\.googleapis|use\.typekit|\.woff2?|\.ttf|\.otf|shutterstock|gettyimages|istock|depositphotos|adobestock|freepik|flaticon/i.test(t) || /(^|\/)(LICENSE|OFL|credits?|attributions?)[^/]*$/i.test(f) },
  "privacy.third-party-data": { any: true, match: (t) => /track\(|identify\(|gtag\(|fbq\(|posthog\.|mixpanel|segment|analytics\.|intercom|crisp|hubspot|openai|anthropic|webhook|zapier|hooks\.|airtable|sheets\.googleapis|resend|sendgrid/i.test(t) },
  "analytics.conversions": { pages: true, match: (t) => /gtag\(|plausible|posthog|mixpanel|amplitude|track\(|fbq\(|onSubmit|addEventListener\(\s*["']submit|checkout|sign-?up|thank/i.test(t) },
  "ai.prompt-injection": { server: true, match: (t) => /openai|anthropic|messages\.create|chat\.completions|generateText|streamText|role\s*:\s*["']system|tools\s*:/i.test(t) },
  "cost.per-load": { any: true, match: (t) => /openai|anthropic|replicate|stability|maps\.googleapis|mapbox|geocod|translate\.googleapis|deepl|elevenlabs|twilio|fal\.ai|images\.generate|generateImage|fetch\(\s*["']\/api\//i.test(t) },
  "cost.free-tier": { any: true, match: (t, f) => /(^|\/)(package\.json|vercel\.json|netlify\.toml|render\.yaml|fly\.toml|firebase\.json|supabase\/config\.toml)$/.test(f) || /createClient\(|initializeApp\(|new Resend|new OpenAI|new Anthropic|mapbox|maps\.googleapis/.test(t) },
  "ai.output-as-code": { match: (t) => /dangerouslySetInnerHTML|\.innerHTML\s*=|v-html=|\{@html|marked\(|markdown-it|rehype-raw|eval\(|new Function\(/.test(t) || PAID_CALL.test(t) && /openai|anthropic|generativelanguage|completion|messages\.create/i.test(t) },
};

/** What to tell the user when a check has nothing to read. */
const NOTHING = {
  "sec.server-authz": "no server code found — permissions can only be checked where the server code is",
  "sec.rate-limit": "no server endpoints that call paid services were found",
  "ai.output-as-code": "no code that shows model answers was found",
  "forms.thank-you": "no forms were found",
  "privacy.policy-matches": "nothing to compare",
  "privacy.licenses": "no fonts, images or licence notes to check",
  "privacy.third-party-data": "no code that sends data to outside services was found",
  "analytics.conversions": "no forms, main buttons or analytics code were found",
  "ai.prompt-injection": "no code that builds prompts was found",
  "cost.per-load": "no paid calls were found",
  "cost.free-tier": "no outside services were found",
  "shop.vat": "no price or tax calculation was found in the code",
  "content.button-labels": "no buttons or links were found",
  "content.error-copy": "no error messages were found in the code",
  "content.404-copy": "the site has no not-found page of its own (qa.custom-404 covers that)",
  "data.delete-export": "nothing to read",
  "sec.xss-output": "no code that inserts HTML or reads the address bar was found",
  "sec.login-limit": "no code that checks a password was found — sign-in is handled elsewhere",
  "leftover.mock-data": "nothing that looks like sample content was found",
  "leftover.unwired-ui": "no buttons or forms with empty or placeholder handlers were found",
  "qa.empty-states": "no lists of data were found",
  "content.terms": "no page text to compare",
};

/** The visible text of every scanned page, one section per page, for checks that read wording. */
export async function writePagesText(root, pages) {
  const lines = [];
  for (const p of pages) {
    lines.push(`=== ${p.path}`, ...(p.segments ?? [p.text ?? ""]).filter(Boolean), "");
  }
  await mkdir(path.join(root, STATE_DIR, "review"), { recursive: true });
  await writeFile(path.join(root, PAGES_FILE), lines.join("\n"));
}

/**
 * @param {{ entry: any, rubric: string }} check
 * @returns {Promise<{ files: string[], pages: boolean } | { skip: string }>}
 */
export async function reviewSources(project, check) {
  const src = SOURCES[check.entry.id];
  if (!src) return { skip: "no rubric sources defined" };
  const candidates = src.any ? project.files.filter((f) => /\.(js|jsx|ts|tsx|mjs|cjs|json|toml|ya?ml|css|scss|html?|vue|svelte|astro|rules|sql)$/.test(f) && !/node_modules|\.test\.|\.spec\.|package-lock|pnpm-lock|yarn\.lock/.test(f)) : src.server ? project.files.filter((f) => /\.(js|jsx|ts|tsx|mjs|cjs|rules|sql)$/.test(f) && !/node_modules|\.test\.|\.spec\./.test(f)) : project.shippedSource();
  const files = [];
  for (const f of candidates) {
    const text = await project.read(f);
    if (text && src.match(text, f)) files.push(f);
    if (files.length >= MAX_FILES) break;
  }
  if (!files.length && !src.pages) return { skip: NOTHING[check.entry.id] };
  return { files: files.sort(), pages: Boolean(src.pages) };
}

/** Same rubric and same code → same fingerprint → the earlier review still stands. */
export async function fingerprint(root, rubricPath, files) {
  const h = createHash("sha1");
  h.update(await readFile(rubricPath, "utf8"));
  for (const f of files) h.update(`\0${f}\0`).update(await readFile(path.join(root, f)).catch(() => Buffer.from("")));
  return h.digest("hex").slice(0, 16);
}

export class ReviewError extends Error {}

/**
 * Checks a reviewer's answer before it's allowed into the state: every question answered, every
 * failing answer and every finding backed by a quote that really is on that line of that file.
 * @returns {Promise<{ status: "pass"|"fail"|"uncertain", items: any[] }>}
 */
export async function verifyReview(root, task, entry, review) {
  const problems = [];
  if (review.checkId !== task.checkId) problems.push(`checkId is "${review.checkId}", expected "${task.checkId}"`);
  const answers = Array.isArray(review.answers) ? review.answers : [];
  if (!answers.length) problems.push("no answers");
  const findings = Array.isArray(review.findings) ? review.findings : [];

  const lineCache = new Map();
  const checkQuote = async (q, where) => {
    if (!q || typeof q.file !== "string" || !Number.isInteger(q.line) || typeof q.text !== "string" || !q.text.trim()) {
      problems.push(`${where}: a quote needs file, line and text`);
      return;
    }
    const file = path.normalize(q.file).replace(/^\.\//, "");
    if (file.startsWith("..") || path.isAbsolute(file)) {
      problems.push(`${where}: ${q.file} is outside the project`);
      return;
    }
    if (!lineCache.has(file)) lineCache.set(file, readFile(path.join(root, file), "utf8").then((t) => t.split("\n")).catch(() => null));
    const lines = await lineCache.get(file);
    if (!lines) return problems.push(`${where}: ${q.file} doesn't exist`);
    const line = lines[q.line - 1];
    const norm = (s) => s.replace(/\s+/g, " ").trim();
    if (line === undefined || !norm(line).includes(norm(q.text))) problems.push(`${where}: "${q.text.slice(0, 60)}" is not on line ${q.line} of ${q.file}`);
  };

  for (const [i, a] of answers.entries()) {
    if (!["pass", "fail", "uncertain"].includes(a.answer)) problems.push(`answer ${i + 1}: must be pass, fail or uncertain`);
    if (a.answer === "fail" || a.quote) await checkQuote(a.quote, `answer ${a.question ?? i + 1}`);
  }
  const failed = answers.some((a) => a.answer === "fail");
  if (failed && !findings.length) problems.push("a failing answer needs at least one finding");
  if (!failed && findings.length) problems.push("findings were given but no answer failed");
  for (const [i, f] of findings.entries()) {
    for (const k of ["key", "title", "impact", "evidence", "fix"]) if (typeof f[k] !== "string" || !f[k].trim()) problems.push(`finding ${i + 1}: missing ${k}`);
    if (!Array.isArray(f.quotes) || !f.quotes.length) problems.push(`finding ${i + 1}: needs at least one quote`);
    for (const q of f.quotes ?? []) await checkQuote(q, `finding ${i + 1}`);
    if (entry.fixer === "choice" && !(Array.isArray(f.options) && f.options.length >= 2 && f.options.length <= 3)) problems.push(`finding ${i + 1}: a "choice" check needs 2 or 3 options`);
  }
  if (problems.length) throw new ReviewError(`The review for ${task.checkId} was rejected:\n  - ${problems.join("\n  - ")}`);

  const status = failed ? "fail" : answers.some((a) => a.answer === "uncertain") ? "uncertain" : "pass";
  const items = findings.map((f) => ({
    checkId: task.checkId,
    status: "fail",
    key: f.key,
    title: f.title,
    impact: f.impact,
    evidence: f.evidence,
    fix: f.fix,
    location: f.location ?? { file: f.quotes[0].file, line: f.quotes[0].line },
    quotes: f.quotes,
    ...(f.options ? { options: f.options } : {}),
    shot: null,
  }));
  if (status === "uncertain") {
    const open = answers.filter((a) => a.answer === "uncertain");
    items.push({
      checkId: task.checkId,
      status: "uncertain",
      key: "review",
      title: "The reviewer couldn't decide some of this",
      impact: "",
      evidence: open.map((a) => `Question ${a.question}: ${a.why ?? "not enough to go on"}`).join("; "),
      fix: "",
      location: {},
      shot: null,
    });
  }
  return { status, items, answers };
}
