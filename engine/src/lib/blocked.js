/**
 * Hosts' bot protection (Vercel Security Checkpoint, Cloudflare challenges…) answers automated
 * requests with a challenge page instead of the real content. That says nothing about the site, so
 * checks must answer "couldn't tell", never "fail" (docs/03). Launch Check never tries to get past it.
 */
const CHALLENGE_BODY = /Vercel Security Checkpoint|Failed to verify your browser|Just a moment\.\.\.|cf-chl-|Attention Required! \| Cloudflare|challenge-platform|DDoS protection by|captcha-delivery\.com/i;

/**
 * @param {{ status?: number|null, headers?: Record<string,string>, body?: string|null }} res
 */
export function isChallenge({ status, headers = {}, body = null }) {
  if (headers["x-vercel-mitigated"] === "challenge" || headers["cf-mitigated"] === "challenge") return true;
  if (headers["x-launch-check-unavailable"]) return true;
  if (![403, 429, 503].includes(status ?? 0)) return false;
  return typeof body === "string" && CHALLENGE_BODY.test(body.slice(0, 20_000));
}

export const BLOCKED_TITLE = "The site's bot protection blocked part of the check";
export const BLOCKED_FIX =
  "Scan the local version instead (it has no bot protection), or briefly allow automated visits in your host's firewall settings and scan again";

export const UNAVAILABLE = "this local copy (the app's server functions in api/ only run on the host)";
export const UNAVAILABLE_TITLE = "Part of the app doesn't run in this local copy";
export const UNAVAILABLE_FIX = "Scan the live site for these, or run the app with its host's own dev server (for Vercel: vercel dev) and scan that";

/** Who answered instead of the site, for a plain explanation. */
export function blockerName(headers = {}) {
  if (headers["x-launch-check-unavailable"]) return UNAVAILABLE;
  if (headers["x-vercel-mitigated"] || headers["x-vercel-id"]) return "Vercel's bot protection";
  if (headers["cf-mitigated"] || /cloudflare/i.test(headers.server ?? "")) return "Cloudflare's bot protection";
  return "the host's bot protection";
}
