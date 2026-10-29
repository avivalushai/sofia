import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { copyFixture } from "./helpers/serve.js";

const BIN = fileURLToPath(new URL("../bin/launch-check.js", import.meta.url));
const exec = promisify(execFile);
let dir;

/** Each call is a separate process — like a new Claude session reading the same project. */
async function lc(...args) {
  try {
    const { stdout } = await exec(process.execPath, [BIN, ...args, "--json"], { cwd: dir });
    return { code: 0, out: JSON.parse(stdout) };
  } catch (e) {
    return { code: e.code, out: e.stdout ? JSON.parse(e.stdout || "null") : null, err: e.stderr };
  }
}
const git = async (...args) => (await exec("git", ["-C", dir, ...args])).stdout.trim();
const state = async () => JSON.parse(await readFile(path.join(dir, ".launch-check", "state.json"), "utf8"));

before(async () => {
  dir = await copyFixture("broken-landing");
  await git("init", "-q");
  await git("add", "-A");
  await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "the app");
  const r = await lc("run", "--target", "local", "--mode", "quick");
  assert.equal(r.code, 0, r.err);
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("detect works before any target is chosen", async () => {
  const { out } = await lc("detect");
  assert.equal(out.detected.forms.value, true);
  assert.equal(out.detected.he.value, true);
  assert.equal(out.skippedChecks.shop, 6);
  assert.equal(out.local.how, "serve the HTML folder");
  assert.equal(out.git, true);
});

test("summary gives the chat what it needs: blockers by name and the three fixer groups", async () => {
  const { out } = await lc("summary");
  assert.equal(out.verdict, "Not ready");
  assert.ok(out.blockers.some((b) => b.checkId === "sec.client-secrets"));
  assert.ok(out.buckets.claude.includes("a11y.lang"));
  assert.ok(out.buckets.user.includes("sec.client-secrets"));
  assert.equal(out.sinceLast.firstRun, true);
  // one item per check, however many pages it happens on
  const copyright = out.items.find((i) => i.checkId === "content.copyright-year");
  assert.equal(copyright.count, 2);
});

test("checkpoint commits the current work before the first fix", async () => {
  const { out } = await lc("checkpoint");
  assert.equal(out.kind, "git");
  assert.ok(out.ref);
  assert.equal(await git("status", "--porcelain"), "");
});

test("a fix that doesn't pass is never committed", async () => {
  const head = await git("rev-parse", "--short", "HEAD");
  await writeFile(path.join(dir, "index.html"), (await readFile(path.join(dir, "index.html"), "utf8")).replace('<html dir="rtl">', '<html lang="" dir="rtl">'));
  const { out } = await lc("recheck", "a11y.lang", "--commit", "Page language set");
  assert.equal(out.passed, false);
  assert.equal(out.commit, null);
  assert.equal(await git("rev-parse", "--short", "HEAD"), head);
  await git("checkout", "--", "index.html");
});

test("nothing can be fixed unless the user approved it", async () => {
  const refused = await lc("fixing", "a11y.lang");
  assert.equal(refused.code, 2);
  assert.match(refused.err, /Not approved for fixing/);
  assert.equal((await state()).findings["f_a11y.lang_home"].status, "open");
  const { out } = await lc("queue", "add", "a11y.lang");
  assert.deepEqual(out.approved, ["f_a11y.lang_home"]);
  assert.deepEqual((await state()).pending.fix, ["f_a11y.lang_home"]);
  assert.deepEqual((await lc("summary")).out.approved, ["a11y.lang"]);
});

test("a passing fix gets its own commit, recorded on the finding", async () => {
  assert.deepEqual((await lc("fixing", "a11y.lang")).out.fixing, ["f_a11y.lang_home"]);
  assert.equal((await state()).findings["f_a11y.lang_home"].status, "fixing");
  await writeFile(path.join(dir, "index.html"), (await readFile(path.join(dir, "index.html"), "utf8")).replace('<html dir="rtl">', '<html lang="he" dir="rtl">'));
  const { out } = await lc("recheck", "a11y.lang", "--commit", "Page language set to Hebrew");
  assert.equal(out.passed, true);
  assert.ok(out.commit);
  assert.ok(out.scoreAfter > out.scoreBefore, `${out.scoreBefore} → ${out.scoreAfter}`);
  assert.match(await git("log", "-1", "--format=%s"), /Sofia: Page language set to Hebrew/);
  const f = (await state()).findings["f_a11y.lang_home"];
  assert.equal(f.status, "fixed");
  assert.deepEqual(f.fixCommits, [out.commit]);
  assert.deepEqual((await state()).pending.fix, [], "a verified fix leaves the approved list");
});

test("a second fix, then undoing only the first one", async () => {
  const css = path.join(dir, "assets", "style.css");
  await writeFile(css, (await readFile(css, "utf8")).replace("footer { padding: 16px; color: #777; }", "footer { padding: 16px; color: #555; }"));
  const html = path.join(dir, "index.html");
  await writeFile(html, (await readFile(html, "utf8")).replace("© 2024", "© 2026"));
  await writeFile(path.join(dir, "pricing.html"), (await readFile(path.join(dir, "pricing.html"), "utf8")).replace("© 2024", "© 2026"));
  const second = await lc("recheck", "content.copyright-year", "--commit", "Footer year updated");
  assert.equal(second.out.passed, true);

  const { out } = await lc("revert", "a11y.lang");
  assert.equal(out.reopened[0].id, "f_a11y.lang_home");
  assert.match(await readFile(html, "utf8"), /<html dir="rtl">/, "the language fix is undone");
  assert.match(await readFile(html, "utf8"), /© 2026/, "the other fix stays");
  assert.equal((await state()).findings["f_content.copyright-year_home"].status, "fixed");
});

test("muting a category changes the score and persists across sessions", async () => {
  const before = (await lc("summary")).out;
  const { out } = await lc("decide", "privacy", "--action", "mute", "--scope", "category", "--reason", "Personal project");
  // with 175 checks a small category can move the score by less than a point; it can never lower it
  assert.ok(out.scoreAfter >= before.score, `${out.scoreAfter} < ${before.score}`);
  // a new process, a new "session": the decision is still there and still counts
  const later = (await lc("summary")).out;
  assert.equal(later.score, out.scoreAfter);
  assert.ok(!later.buckets.user.includes("privacy.policy"));
  assert.ok(later.parked.muted.some((m) => m.scope === "category" && m.target === "privacy"));
  // and a new scan keeps honouring it
  await lc("run", "--target", "local", "--mode", "quick");
  assert.ok(!(await lc("summary")).out.buckets.user.includes("privacy.policy"));
  const un = await lc("decide", "privacy", "--action", "unmute", "--scope", "category");
  assert.equal(un.code, 0);
  assert.ok((await lc("summary")).out.buckets.user.includes("privacy.policy"));
  // a category with real weight does move the score, and unmuting brings it back
  const base = (await lc("summary")).out.score;
  const forms = await lc("decide", "forms", "--action", "mute", "--scope", "category", "--reason", "No forms yet");
  assert.ok(forms.out.scoreAfter > base, `${forms.out.scoreAfter} should be above ${base}`);
  await lc("decide", "forms", "--action", "unmute", "--scope", "category");
  assert.equal((await lc("summary")).out.score, base);
});

test("accept and defer are per finding, with a reason", async () => {
  const bad = await lc("decide", "a11y.contrast", "--action", "accept", "--scope", "check", "--reason", "x");
  assert.equal(bad.code, 2);
  const noReason = await lc("decide", "seo.title", "--action", "defer", "--scope", "instance");
  assert.equal(noReason.code, 2);
  const { out } = await lc("decide", "seo.title", "--action", "defer", "--scope", "instance", "--reason", "Next run");
  assert.equal(out.changed.length, 2);
  const s = (await lc("summary")).out;
  assert.ok(s.parked.deferred.some((d) => d.checkId === "seo.title"));
  assert.ok(!s.buckets.claude.includes("seo.title"));
});

test("a re-run reports only what changed since the last scan", async () => {
  const html = path.join(dir, "index.html");
  await writeFile(html, (await readFile(html, "utf8")).replace("Lorem ipsum dolor sit amet, consectetur adipiscing elit.", "שיעורים בקבוצות של עד שישה משתתפים."));
  await lc("run", "--target", "local", "--mode", "quick");
  const { out } = await lc("summary");
  assert.equal(out.sinceLast.firstRun, false);
  assert.deepEqual(out.sinceLast.fixed, ["Placeholder text is still on the page"]);
  assert.deepEqual(out.sinceLast.new, []);
  assert.ok(out.sinceLast.stillOpen.length > 0);
});

test("a new fix can't start on top of uncommitted changes", async () => {
  await git("add", "-A");
  await git("commit", "-qm", "edits from earlier tests");
  await writeFile(path.join(dir, "stray.txt"), "left over");
  const r = await lc("fixing", "seo.share-tags");
  assert.equal(r.code, 2);
  assert.match(r.err, /uncommitted changes \(stray\.txt\)/);
  await rm(path.join(dir, "stray.txt"));
});

test("recheck takes a category, and a yes to submitting forms lasts for the session", async () => {
  const first = await lc("recheck", "forms", "--consent", "submit-forms");
  assert.equal(first.code, 0, first.err);
  const ids = first.out.checks.map((c) => c.id);
  assert.ok(ids.every((id) => id.startsWith("forms.")), ids.join(", "));
  const submitting = first.out.checks.filter((c) => ["forms.destination", "forms.success-truth", "forms.validation"].includes(c.id));
  assert.equal(submitting.length, 3, "the checks that submit the form are rechecked");
  assert.ok(submitting.every((c) => c.status !== "skip"), "the yes to submitting forms is used");
  // no --consent this time: the yes from a moment ago still counts
  const again = await lc("recheck", "forms.success-truth");
  assert.equal(again.out.checks[0].status, "fail");
  assert.deepEqual(again.out.skipped, []);
});

test("a local scan serves the project's 404.html like a real static host", async () => {
  await writeFile(path.join(dir, "404.html"), '<!doctype html><html lang="he"><title>לא נמצא</title><body><p>הדף לא נמצא</p><a href="/index.html">לדף הבית</a></body></html>');
  const { out } = await lc("recheck", "qa.custom-404");
  assert.equal(out.checks[0].status, "pass");
  await rm(path.join(dir, "404.html"));
});

test("a share image with a partial address fails: WhatsApp can't fetch it", async () => {
  const html = path.join(dir, "pricing.html");
  const orig = await readFile(html, "utf8");
  await writeFile(html, orig.replace("<title>", '<meta property="og:title" content="x"><meta property="og:description" content="y"><meta property="og:image" content="/share.png"><title>'));
  await lc("recheck", "seo.share-tags");
  const f = (await state()).findings["f_seo.share-tags_pricing.html"];
  assert.equal(f.status, "open");
  assert.match(f.evidence, /partial address/);
  await writeFile(html, orig);
});

test("the report page: one server per project, state over HTTP, a live update within a second", async () => {
  const first = await lc("serve");
  assert.equal(first.code, 0, first.err);
  const again = await lc("serve");
  assert.equal(again.out.url, first.out.url, "a running server is reused");
  assert.equal(again.out.started, false);
  const body = await (await fetch(new URL("/api/state", first.out.url))).json();
  assert.ok(body.summary.score !== undefined);
  assert.ok(body.catalog.length > 100);
  assert.equal((await fetch(new URL("/", first.out.url))).status, 200);

  // listen for the change event, then change the state
  const ctrl = new AbortController();
  const res = await fetch(new URL("/api/events", first.out.url), { signal: ctrl.signal });
  const reader = res.body.getReader();
  const started = Date.now();
  await lc("decide", "seo.title", "--action", "unmute", "--scope", "check");
  let got = "";
  while (!got.includes("event: state") && Date.now() - started < 3000) got += new TextDecoder().decode((await reader.read()).value);
  ctrl.abort();
  assert.ok(got.includes("event: state"), "the page hears about the change");
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);

  const info = JSON.parse(await readFile(path.join(dir, ".launch-check", "server.json"), "utf8"));
  process.kill(info.pid);
});
