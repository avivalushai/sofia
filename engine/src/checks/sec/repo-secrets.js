import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { findSecrets, mask } from "../../lib/secrets.js";

const SKIP_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)$|\.launch-check\//;

/**
 * Streams `git log -p` over every branch and collects secrets in added lines.
 * @returns {Promise<Map<string, { value: string, pattern: any, commit: string, file: string }>>}
 */
function scanHistory(root) {
  return new Promise((resolve, reject) => {
    const git = spawn("git", ["-C", root, "log", "-p", "--all", "--no-color", "--no-ext-diff", "-U0", "--format=commit %H"], { stdio: ["ignore", "pipe", "ignore"] });
    const found = new Map();
    let commit = "";
    let file = "";
    const rl = createInterface({ input: git.stdout });
    rl.on("line", (line) => {
      if (line.startsWith("commit ")) commit = line.slice(7, 14);
      else if (line.startsWith("+++ b/")) file = line.slice(6);
      else if (line.startsWith("+") && !line.startsWith("+++") && !SKIP_FILES.test(file)) {
        for (const hit of findSecrets(line)) {
          const key = `${hit.pattern.id}_${mask(hit.value)}`;
          // git log runs newest first: keep overwriting so the earliest commit wins
          found.set(key, { value: hit.value, pattern: hit.pattern, commit, file });
        }
      }
    });
    git.on("error", reject);
    git.on("close", (code) => (code === 0 ? resolve(found) : reject(new Error(`git log exited with ${code}`))));
  });
}

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.repo-secrets",
  layer: "mechanical",
  async run(ctx) {
    if (!ctx.project.isGit) return [ctx.skip("the project isn't a git repository, so there's no history to scan")];
    const found = await scanHistory(ctx.project.root);
    const results = [];
    for (const [key, { pattern, value, commit, file }] of [...found].sort(([a], [b]) => (a < b ? -1 : 1))) {
      results.push(ctx.fail({
        key,
        title: "A secret key is saved in the project's history",
        impact: "Anyone who gets a copy of the code — a collaborator, a public repo, a leaked laptop — can use the key, even if it was deleted later",
        location: { file },
        evidence: `${pattern.name} (${mask(value)}) added in commit ${commit}`,
        fix: `1. Rotate the key — deleting it from the code isn't enough, it stays in the history: ${pattern.rotate}. 2. Put the new key only in .env files that are in .gitignore and in your host's environment settings. 3. Tell me when it's done and I'll re-check.`,
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
