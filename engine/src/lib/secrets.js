/**
 * Secret-key patterns. Only keys that must never be public: publishable keys
 * (Stripe pk_, Firebase/Google AIza…, Supabase anon) are deliberately absent.
 */
export const SECRET_PATTERNS = [
  { id: "stripe", name: "Stripe secret key", re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g, rotate: "Stripe → Developers → API keys (dashboard.stripe.com/apikeys) → Roll key" },
  { id: "stripe-webhook", name: "Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{24,}\b/g, rotate: "Stripe → Developers → Webhooks → your endpoint → Roll secret" },
  { id: "anthropic", name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, rotate: "console.anthropic.com → Settings → API keys → delete the old key and create a new one" },
  { id: "openai", name: "OpenAI API key", re: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g, rotate: "platform.openai.com/api-keys → revoke the old key and create a new one" },
  { id: "aws", name: "AWS access key", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, rotate: "AWS console → IAM → Users → Security credentials → deactivate and delete the key" },
  { id: "github", name: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b/g, rotate: "github.com/settings/tokens → delete the token" },
  { id: "slack", name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, rotate: "api.slack.com/apps → your app → OAuth & Permissions → revoke and reinstall" },
  { id: "sendgrid", name: "SendGrid API key", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, rotate: "SendGrid → Settings → API Keys → delete the key and create a new one" },
  { id: "resend", name: "Resend API key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/g, rotate: "resend.com/api-keys → delete the key and create a new one" },
  { id: "private-key", name: "Private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g, rotate: "Create a new key pair with the service that issued it and delete the old one" },
  { id: "supabase-service", name: "Supabase service-role key", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, rotate: "Supabase → Project Settings → API → roll the service_role key", jwtRole: "service_role" },
];

/** Shows enough to recognise a key without repeating it. */
export function mask(value) {
  return value.length <= 12 ? `${value.slice(0, 4)}…` : `${value.slice(0, 10)}…`;
}

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @returns {{ pattern: typeof SECRET_PATTERNS[number], value: string, index: number }[]}
 */
export function findSecrets(text) {
  const hits = [];
  for (const pattern of SECRET_PATTERNS) {
    for (const m of text.matchAll(pattern.re)) {
      if (pattern.jwtRole && jwtRole(m[0]) !== pattern.jwtRole) continue;
      hits.push({ pattern, value: m[0], index: m.index });
    }
  }
  return hits;
}

/** Env var prefixes that frameworks copy into browser code. */
export const PUBLIC_ENV_PREFIX = /^(NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|PUBLIC_|NUXT_PUBLIC_|GATSBY_)/;
export const SECRET_NAME = /SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|_SK\b|SK_LIVE|API_SECRET/i;
