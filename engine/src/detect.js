import { all, attr, hebrewRatio } from "./lib/html.js";

/**
 * Facts used by `appliesWhen` in the catalog. Each records why it was set, true or false,
 * so the report can say "skipped 6 payment checks — no payment provider found".
 */

const MAIL_DEPS = ["resend", "nodemailer", "@sendgrid/mail", "postmark", "mailgun.js", "mailgun-js", "@aws-sdk/client-ses", "@aws-sdk/client-sesv2", "@emailjs/browser", "emailjs-com", "@react-email/components", "react-email", "@mailchimp/mailchimp_transactional", "brevo", "@getbrevo/brevo", "sib-api-v3-sdk", "loops", "plunk"];
const MAIL_HOSTS = /api\.(resend\.com|sendgrid\.com|postmarkapp\.com|mailgun\.net|brevo\.com|sendinblue\.com|emailjs\.com)/;
const AUTH_DEPS = ["next-auth", "@auth/core", "@auth/nextjs", "@clerk/nextjs", "@clerk/clerk-react", "@clerk/clerk-js", "@supabase/auth-helpers-nextjs", "@supabase/ssr", "@supabase/auth-ui-react", "firebase-admin", "lucia", "passport", "better-auth", "@kinde-oss/kinde-auth-nextjs", "@auth0/nextjs-auth0", "@auth0/auth0-react", "@stytch/nextjs", "@workos-inc/authkit-nextjs", "@privy-io/react-auth"];
const AUTH_CODE = /supabase\.auth\.|from ["']firebase\/auth["']|getAuth\(|signInWith(Password|OAuth|EmailAndPassword|Popup)/;
const DB_DEPS = ["prisma", "@prisma/client", "drizzle-orm", "mongoose", "mongodb", "pg", "postgres", "mysql2", "@supabase/supabase-js", "@planetscale/database", "@neondatabase/serverless", "better-sqlite3", "sqlite3", "@libsql/client", "kysely", "typeorm", "sequelize", "@vercel/postgres", "@vercel/kv", "@upstash/redis", "convex", "@instantdb/react", "pocketbase", "appwrite"];
const DB_CODE = /from ["']firebase\/(firestore|database)["']|getFirestore\(|getDatabase\(|supabase\s*\.\s*from\(/;
const SHOP_DEPS = ["stripe", "@stripe/stripe-js", "@stripe/react-stripe-js", "@lemonsqueezy/lemonsqueezy.js", "@paddle/paddle-js", "@paddle/paddle-node-sdk", "@paypal/react-paypal-js", "@paypal/paypal-js", "@shopify/hydrogen", "shopify-buy", "polar-sdk", "@polar-sh/sdk"];
const SHOP_HTML = /js\.stripe\.com|buy\.stripe\.com|checkout\.stripe\.com|paypal\.com\/sdk|paypal\.me\/|lemonsqueezy\.com\/(checkout|buy)|gumroad\.com\/l\/|cdn\.paddle\.com/;
const AI_DEPS = ["openai", "@anthropic-ai/sdk", "ai", "@ai-sdk/openai", "@ai-sdk/anthropic", "@google/generative-ai", "@google/genai", "langchain", "@langchain/core", "replicate", "groq-sdk", "cohere-ai", "@mistralai/mistralai", "together-ai", "ollama"];
const AI_CODE = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|openrouter\.ai\/api/;
const I18N_DEPS = ["i18next", "react-i18next", "next-intl", "react-intl", "vue-i18n", "@nuxtjs/i18n", "next-i18next", "@lingui/core", "svelte-i18n", "@inlang/paraglide-js", "typesafe-i18n"];
const ADS_HTML = /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init|googleadservices\.com|gtag\/js\?id=AW-|['"]AW-\d+|snap\.licdn\.com|analytics\.tiktok\.com|static\.ads-twitter\.com|ads\.linkedin\.com|sc-static\.net\/scevent|s\.pinimg\.com\/ct/;

/**
 * @param {Awaited<ReturnType<import("./project.js").loadProject>>} project
 * @param {import("./crawl.js").Page[]} pages
 */
export async function detect(project, pages) {
  const source = [];
  for (const f of project.shippedSource()) {
    const text = await project.read(f);
    if (text) source.push({ file: f, text });
  }
  const dep = (list) => list.find((d) => project.deps.has(d));
  const inCode = (re) => source.find((s) => re.test(s.text));
  const inPages = (re) => pages.find((p) => re.test(p.html));
  const yes = (why) => ({ value: true, why });
  const no = (why) => ({ value: false, why });

  const facts = {};

  // forms
  const formPage = pages.find((p) => all(p.doc, "form").length > 0);
  const formCode = inCode(/<form[\s>]|onSubmit=|useForm\(/);
  facts.forms = formPage ? yes(`found a form on ${formPage.path}`)
    : dep(["react-hook-form", "formik", "@tanstack/react-form"]) ? yes(`uses ${dep(["react-hook-form", "formik", "@tanstack/react-form"])}`)
    : formCode ? yes(`found a form in ${formCode.file}`)
    : no("no forms found on the pages or in the code");

  // mail
  const mailDep = dep(MAIL_DEPS);
  const mailCode = inCode(MAIL_HOSTS);
  facts.mail = mailDep ? yes(`uses ${mailDep}`) : mailCode ? yes(`calls an email service in ${mailCode.file}`) : no("no email-sending library or service found");

  // auth
  const authDep = dep(AUTH_DEPS);
  const authCode = inCode(AUTH_CODE);
  const passwordPage = pages.find((p) => all(p.doc, "input").some((i) => attr(i, "type") === "password"));
  facts.auth = authDep ? yes(`uses ${authDep}`) : authCode ? yes(`sign-in code in ${authCode.file}`) : passwordPage ? yes(`password field on ${passwordPage.path}`) : no("no login found");

  // db
  const dbDep = dep(DB_DEPS);
  const dbCode = inCode(DB_CODE);
  const schemaFile = project.files.find((f) => /(^|\/)schema\.prisma$|(^|\/)drizzle\.config\.|(^|\/)supabase\/migrations\/|(^|\/)firestore\.rules$/.test(f));
  facts.db = dbDep ? yes(`uses ${dbDep}`) : dbCode ? yes(`database code in ${dbCode.file}`) : schemaFile ? yes(`found ${schemaFile}`) : no("no database found");

  // shop
  const shopDep = dep(SHOP_DEPS);
  const shopPage = inPages(SHOP_HTML);
  const shopCode = inCode(SHOP_HTML);
  facts.shop = shopDep ? yes(`uses ${shopDep}`) : shopPage ? yes(`payment link or script on ${shopPage.path}`) : shopCode ? yes(`payment link in ${shopCode.file}`) : no("no payment provider found");

  // ai
  const aiDep = dep(AI_DEPS);
  const aiCode = inCode(AI_CODE);
  facts.ai = aiDep ? yes(`uses ${aiDep}`) : aiCode ? yes(`calls an AI model in ${aiCode.file}`) : no("no AI model calls found");

  // he
  const hePage = pages.find((p) => /^(he|iw)\b/i.test(p.lang ?? ""));
  const allText = pages.map((p) => p.text).join(" ");
  const ratio = hebrewRatio(allText);
  facts.he = hePage ? yes(`lang="he" on ${hePage.path}`) : ratio > 0.3 ? yes(`${Math.round(ratio * 100)}% of the text is Hebrew`) : no("the pages aren't in Hebrew");

  // i18n
  const i18nDep = dep(I18N_DEPS);
  const hreflangPage = pages.find((p) => all(p.doc, "link").some((l) => attr(l, "hreflang")));
  const langs = new Set(pages.map((p) => p.lang?.toLowerCase().split("-")[0]).filter(Boolean));
  facts.i18n = i18nDep ? yes(`uses ${i18nDep}`) : hreflangPage ? yes(`language alternates on ${hreflangPage.path}`) : langs.size > 1 ? yes(`pages in ${[...langs].sort().join(", ")}`) : no("one language only");

  // dark
  const cssFiles = project.files.filter((f) => /\.(css|scss)$/.test(f));
  let darkWhy = null;
  for (const f of cssFiles) {
    if (/prefers-color-scheme:\s*dark/.test((await project.read(f)) ?? "")) {
      darkWhy = `dark styles in ${f}`;
      break;
    }
  }
  if (!darkWhy && dep(["next-themes", "@nuxtjs/color-mode", "mode-watcher"])) darkWhy = `uses ${dep(["next-themes", "@nuxtjs/color-mode", "mode-watcher"])}`;
  if (!darkWhy) {
    const page = inPages(/prefers-color-scheme:\s*dark/);
    if (page) darkWhy = `dark styles on ${page.path}`;
  }
  if (!darkWhy) {
    const darkClasses = source.reduce((n, s) => n + (s.text.match(/\bdark:[a-z]/g)?.length ?? 0), 0);
    if (darkClasses >= 5) darkWhy = `${darkClasses} dark-mode classes in the code`;
  }
  facts.dark = darkWhy ? yes(darkWhy) : no("no dark mode found");

  // ads
  const adsPage = inPages(ADS_HTML);
  const adsCode = inCode(ADS_HTML);
  facts.ads = adsPage ? yes(`ad pixel on ${adsPage.path}`) : adsCode ? yes(`ad pixel in ${adsCode.file}`) : project.deps.has("react-facebook-pixel") ? yes("uses react-facebook-pixel") : no("no ad pixels found");

  return facts;
}
