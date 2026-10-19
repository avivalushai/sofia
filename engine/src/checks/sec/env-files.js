// Two requests, spaced out: more of these look like an attack scan to hosts' firewalls. A site that
// serves .env (or .git) at all serves them from the folder it was deployed from, so these two tell.
const PATHS = [
  { path: "/.env", looks: /^\s*[A-Z_][A-Z0-9_]*\s*=/m },
  { path: "/.git/HEAD", looks: /^ref: refs\//m },
];

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.env-files",
  // asks for addresses like /.env or /admin: runs last, see runner
  probe: true,
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const { path, looks } of PATHS) {
      await new Promise((r) => setTimeout(r, 400));
      const res = await ctx.http.get(new URL(path, ctx.target).href, { follow: false });
      // a 200 with the home page (single-page-app fallback) is not the file
      if (res.status !== 200 || /<html|<!doctype/i.test(res.body.slice(0, 300)) || !looks.test(res.body)) continue;
      const git = path.startsWith("/.git");
      results.push(ctx.fail({
        key: path,
        title: git ? "The site's code history can be downloaded" : "A settings file with secrets can be downloaded",
        impact: git
          ? "Anyone can download the full source code and history, including any key that was ever committed"
          : "Anyone can open this address and read your passwords and API keys",
        location: { url: path },
        evidence: `${path} returns the file itself (status 200)`,
        fix: git
          ? "Deploy only the built site, not the project folder, or block /.git in the host settings"
          : "Stop deploying this file (deploy only the built site), then rotate every key that was in it — they're already exposed",
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
