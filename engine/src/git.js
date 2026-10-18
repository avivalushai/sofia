import { execFile } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { STATE_DIR } from "./state.js";

const exec = promisify(execFile);
const FALLBACK_IDENTITY = ["-c", "user.name=Launch Check", "-c", "user.email=launch-check@localhost"];

async function git(root, args) {
  const { stdout } = await exec("git", ["-C", root, ...args], { maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}

export async function isGitRepo(root) {
  try {
    return (await git(root, ["rev-parse", "--is-inside-work-tree"])) === "true";
  } catch {
    return false;
  }
}

async function hasIdentity(root) {
  try {
    await git(root, ["config", "user.email"]);
    return true;
  } catch {
    return false;
  }
}

/** Files with uncommitted changes (ignoring Launch Check's own folder). */
export async function dirtyFiles(root) {
  if (!(await isGitRepo(root))) return [];
  return (await git(root, ["status", "--porcelain"])).split("\n").filter(Boolean).map((l) => l.slice(3)).filter((f) => !f.startsWith(".launch-check"));
}

/**
 * Commits everything (tracked and new files, respecting .gitignore) if anything changed.
 * Uses the user's git identity; if none is set up, commits as "Launch Check" rather than fail.
 * @returns {Promise<string|null>} the new commit's short sha, or null when there was nothing to commit
 */
export async function commitAll(root, message) {
  if (!(await git(root, ["status", "--porcelain"]))) return null;
  await git(root, ["add", "-A"]);
  const identity = (await hasIdentity(root)) ? [] : FALLBACK_IDENTITY;
  await exec("git", ["-C", root, ...identity, "commit", "-q", "-m", message]);
  return git(root, ["rev-parse", "--short", "HEAD"]);
}

/**
 * A safe point to come back to before the first fix of a session (CLAUDE.md: checkpoint before fixing).
 * With git: a commit of the current work (or the current commit if nothing changed).
 * Without git: a copy of the project files in .launch-check/checkpoints/.
 */
export async function checkpoint(root, project, at = new Date().toISOString()) {
  if (await isGitRepo(root)) {
    const created = await commitAll(root, "Launch Check: checkpoint before fixes");
    const ref = created ?? (await git(root, ["rev-parse", "--short", "HEAD"]).catch(() => null));
    if (!ref) {
      // a repository with no commits yet and nothing to commit
      return { kind: "git", ref: null, created: false, at };
    }
    return { kind: "git", ref, created: Boolean(created), at };
  }
  const id = at.replace(/[:.]/g, "-");
  const dir = path.join(root, STATE_DIR, "checkpoints", id);
  await mkdir(dir, { recursive: true });
  for (const f of project.files) {
    await mkdir(path.dirname(path.join(dir, f)), { recursive: true });
    await cp(path.join(root, f), path.join(dir, f)).catch(() => {});
  }
  return { kind: "copy", ref: path.join(STATE_DIR, "checkpoints", id), created: true, at, files: project.files.length };
}

/** Undoes one fix commit with a new commit, leaving every other fix in place. */
export async function revertCommit(root, sha) {
  const identity = (await hasIdentity(root)) ? [] : FALLBACK_IDENTITY;
  try {
    await exec("git", ["-C", root, ...identity, "revert", "--no-edit", sha]);
  } catch (err) {
    await exec("git", ["-C", root, "revert", "--abort"]).catch(() => {});
    throw new Error(`Couldn't undo ${sha} on its own — later changes touch the same lines. (${err.stderr?.split("\n")[0] ?? err.message})`);
  }
  return git(root, ["rev-parse", "--short", "HEAD"]);
}
