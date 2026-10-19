import { blockerName, isChallenge } from "./lib/blocked.js";

export class HttpError extends Error {
  constructor(url, cause) {
    super(`Couldn't reach ${url} (${cause?.cause?.code ?? cause?.name ?? "error"})`);
    this.url = url;
    this.code = cause?.cause?.code ?? cause?.name;
  }
}

const UA = "Mozilla/5.0 (compatible; LaunchCheck/0.1; +https://github.com/launch-check)";

/**
 * fetch with a timeout, no cookies, one retry on network failure, and a record of every redirect hop.
 * @param {{ timeoutMs?: number }} [opts]
 */
export function createHttp({ timeoutMs = 10_000 } = {}) {
  const cache = new Map();
  /** URLs the host's bot protection answered with a challenge instead of content */
  const blocked = new Map();

  /**
   * @param {string} url
   * @param {{ method?: string, as?: "text"|"buffer"|"none", follow?: boolean, headers?: Record<string,string> }} [o]
   * @returns {Promise<{ status: number, url: string, hops: {url: string, status: number}[], headers: Record<string,string>, body: any, size: number|null }>}
   */
  async function request(url, { method = "GET", as = "text", follow = true, headers = {} } = {}) {
    const hops = [];
    let current = url;
    for (let i = 0; i < 10; i++) {
      const res = await fetchOnce(current, { method, headers: { "user-agent": UA, ...headers } });
      const location = res.headers.get("location");
      if (follow && res.status >= 300 && res.status < 400 && location) {
        hops.push({ url: current, status: res.status });
        await res.body?.cancel();
        current = new URL(location, current).href;
        continue;
      }
      const hdrs = Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));
      let body = null;
      let size = hdrs["content-length"] ? Number(hdrs["content-length"]) : null;
      if (as === "none" || method === "HEAD") await res.body?.cancel();
      else if (as === "buffer") {
        body = Buffer.from(await res.arrayBuffer());
        size = body.length;
      } else {
        body = await res.text();
        size ??= Buffer.byteLength(body);
      }
      const challenged = isChallenge({ status: res.status, headers: hdrs, body: typeof body === "string" ? body : null });
      if (challenged) blocked.set(current, blockerName(hdrs));
      return { status: res.status, url: current, hops, headers: hdrs, body, size, blocked: challenged };
    }
    throw new HttpError(url, new Error("too many redirects"));
  }

  async function fetchOnce(url, init) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        lastErr = err;
      }
    }
    throw new HttpError(url, lastErr);
  }

  return {
    blocked,
    request,
    /** Same as request, but cached per run for GETs. */
    get(url, o = {}) {
      const key = `${o.as ?? "text"} ${o.follow === false ? "nofollow" : ""} ${url}`;
      if (!cache.has(key)) cache.set(key, request(url, o));
      return cache.get(key);
    },
  };
}
