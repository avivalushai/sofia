import { isIP } from "node:net";

/** True for addresses that only exist on this machine or a private network. */
export function isLocalHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".test") || h.endsWith(".internal")) return true;
  if (isIP(h) === 4) {
    const [a, b] = h.split(".").map(Number);
    return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  }
  if (isIP(h) === 6) return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
  return false;
}

/** Addresses hosting companies hand out. */
export const PLATFORM_HOST = /\.vercel\.app$|\.netlify\.app$|\.pages\.dev$|\.onrender\.com$|\.fly\.dev$|\.up\.railway\.app$|\.herokuapp\.com$|\.web\.app$|\.firebaseapp\.com$|\.github\.io$|\.wixsite\.com$|\.lovable\.app$|\.replit\.app$|\.repl\.co$|\.bolt\.new$|\.glitch\.me$|\.surge\.sh$|\.amplifyapp\.com$/i;

/** "www.shop.example.co.il" → "example.co.il". Good enough for DNS lookups; not a full public-suffix list. */
export function registrableDomain(hostname) {
  const parts = hostname.toLowerCase().split(".");
  if (parts.length <= 2) return parts.join(".");
  const secondLevel = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "muni", "k12"]);
  const take = secondLevel.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-take).join(".");
}
