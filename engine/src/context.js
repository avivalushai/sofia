import { resolveTxt, resolveMx, resolveCname, resolve4 } from "node:dns/promises";
import { isLocalHost } from "./lib/net.js";
import { lineAt } from "./lib/text.js";

export const VIEWPORTS = { mobile: [375, 390], tablet: [768], desktop: [1280] };

export class CheckBug extends Error {}

const withTimeout = (p, ms = 5000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("DNS timeout"), { code: "ETIMEOUT" })), ms))]);
const NOT_FOUND = new Set(["ENOTFOUND", "ENODATA", "ENOTIMP", "NXDOMAIN"]);

/** DNS lookups. "No such record" resolves to []; real failures (timeouts) throw. */
export const dns = {
  async txt(name) {
    try {
      return (await withTimeout(resolveTxt(name))).map((parts) => parts.join(""));
    } catch (e) {
      if (NOT_FOUND.has(e.code)) return [];
      throw e;
    }
  },
  async mx(name) {
    try {
      return await withTimeout(resolveMx(name));
    } catch (e) {
      if (NOT_FOUND.has(e.code)) return [];
      throw e;
    }
  },
  async cname(name) {
    try {
      return await withTimeout(resolveCname(name));
    } catch (e) {
      if (NOT_FOUND.has(e.code)) return [];
      throw e;
    }
  },
  async a(name) {
    try {
      return await withTimeout(resolve4(name));
    } catch (e) {
      if (NOT_FOUND.has(e.code)) return [];
      throw e;
    }
  },
};

/**
 * The object every check's run(ctx) receives (docs/03).
 * @param {{ entry: any, project: any, crawl: any, http: any, target: string, detected: any, now: Date }} o
 */
export function makeContext({ entry, project, crawl, http, target, detected, now }) {
  const targetUrl = new URL(target);
  const base = { checkId: entry.id };

  const need = (r, fields) => {
    for (const f of fields) {
      if (r[f] == null || r[f] === "") throw new CheckBug(`${entry.id}: result is missing "${f}"`);
    }
  };

  return {
    entry,
    project,
    crawl,
    http,
    dns,
    target,
    targetUrl,
    /** true when the scanned address only exists on this machine or a private network */
    isLocalTarget: isLocalHost(targetUrl.hostname),
    detected,
    now,
    viewports: VIEWPORTS,
    files: project,
    consent: { has: async () => false },
    /**
     * Best-effort map from text a visitor sees to the file and line to edit.
     * With a page, that page's own file is searched first.
     */
    async guessSource(text, page = null) {
      if (page && text) {
        const own = await this.pageSource(page);
        const body = own ? await project.read(own) : null;
        const i = body?.indexOf(text) ?? -1;
        if (i >= 0) return { file: own, line: lineAt(body, i) };
      }
      return project.findText(text);
    },

    /** Best-effort: the file that renders a crawled page. */
    async pageSource(page) {
      const p = decodeURIComponent(page.path.split("?")[0]).replace(/^\//, "");
      const candidates = p === "" || p.endsWith("/") ? [`${p}index.html`] : [p, `${p}.html`, `${p}/index.html`];
      for (const c of candidates) {
        for (const prefix of ["", "public/", "static/", "src/"]) if (project.has(prefix + c)) return prefix + c;
      }
      const layouts = [];
      for (const f of project.shippedSource()) if (/<html[\s>]/.test((await project.read(f)) ?? "")) layouts.push(f);
      return layouts.length === 1 ? layouts[0] : null;
    },

    pass(key = null) {
      return { ...base, status: "pass", key };
    },
    /** @param {{ key: string, title: string, impact: string, location?: any, evidence: string, fix: string, options?: any[], shot?: string|null }} r */
    fail(r) {
      need(r, ["key", "title", "impact", "evidence", "fix"]);
      if (entry.fixer === "choice" && !(Array.isArray(r.options) && r.options.length >= 2 && r.options.length <= 3)) {
        throw new CheckBug(`${entry.id}: fixer is "choice", so a failure needs 2 or 3 options`);
      }
      return { ...base, status: "fail", location: {}, shot: null, ...r };
    },
    uncertain(r) {
      need(r, ["key", "title", "evidence"]);
      return { ...base, status: "uncertain", impact: "", fix: "", location: {}, shot: null, ...r };
    },
    skip(reason) {
      return { ...base, status: "skip", reason };
    },
  };
}
