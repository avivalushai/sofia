// Judgment checks: review tasks from the engine, and the gate every reviewer answer must pass.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { copyFixture, FIXTURES } from "./helpers/serve.js";

const BIN = fileURLToPath(new URL("../bin/launch-check.js", import.meta.url));
const exec = promisify(execFile);
const expected = JSON.parse(await readFile(path.join(FIXTURES, "judgment-app", "expected.json"), "utf8"));
let dir;

async function lc(...args) {
  try {
    const { stdout } = await exec(process.execPath, [BIN, ...args, "--json"], { cwd: dir });
    return { code: 0, out: JSON.parse(stdout) };
  } catch (e) {
    return { code: e.code, err: e.stderr };
  }
}
const state = async () => JSON.parse(await readFile(path.join(dir, ".launch-check", "state.json"), "utf8"));
const save = (name, obj) => writeFile(path.join(dir, name), JSON.stringify(obj));

/** A correct review of sec.rate-limit on this fixture, with real quotes. */
const goodRateLimit = () => ({
  checkId: "sec.rate-limit",
  answers: [
    { question: 1, answer: "fail", why: "api/chat.js calls OpenAI with no limiter", quote: { file: "api/chat.js", line: 3, text: "const { question } = JSON.parse(req.body);" } },
    { question: 2, answer: "fail", why: "no sign-in", quote: { file: "api/chat.js", line: 2, text: "export default async function handler(req, res) {" } },
    { question: 3, answer: "fail", why: "no length cap", quote: { file: "api/chat.js", line: 7, text: "content: question" } },
  ],
  findings: [{
    key: "api/chat.js#rate-limit",
    title: "Anyone can use your AI chat without limit, and you pay for every message",
    impact: "A script can run up your bill",
    evidence: "api/chat.js line 4 sends every request to the model",
    fix: "Limit each visitor",
    location: { file: "api/chat.js", line: 4 },
    quotes: [{ file: "api/chat.js", line: 4, text: 'fetch("https://api.openai.com/v1/chat/completions"' }],
    options: [{ label: "Limit each visitor to N requests per minute", detail: "recommended" }, { label: "Require sign-in", detail: "then limit per account" }],
  }],
});

before(async () => {
  dir = await copyFixture("judgment-app");
  const r = await lc("run", "--target", "local", "--mode", "full", "--only", "leftover,qa.empty-states,content.terms,sec,ai,forms.thank-you,data.delete-export,content.button-labels,content.error-copy,content.404-copy");
  assert.equal(r.code, 0, r.err);
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("detection on the judgment fixture", async () => {
  const d = (await state()).project.detected;
  for (const [fact, value] of Object.entries(expected.detected)) assert.equal(d[fact].value, value, fact);
});

test("a review task for each judgment check, starting from the right files", async () => {
  const { out } = await lc("review-tasks");
  const byId = new Map(out.tasks.map((t) => [t.checkId, t]));
  for (const row of expected.reviews) {
    const task = byId.get(row.checkId);
    assert.ok(task, `${row.checkId}: no review task`);
    for (const f of row.files) assert.ok(task.files.includes(f), `${row.checkId}: ${f} is missing from ${task.files.join(", ")}`);
    assert.match(task.rubric, new RegExp(`rubrics/${row.checkId.replace(".", "\\.")}\\.md$`));
  }
  const pages = await readFile(path.join(dir, ".launch-check", "review", "pages.txt"), "utf8");
  assert.match(pages, /הרשמה/);
  assert.match(pages, /הצטרפות/);
  assert.equal((await state()).checks["sec.rate-limit"], undefined, "nothing is judged until the reviewer answers");
});

test("a quote that isn't really in the code is rejected", async () => {
  const bad = goodRateLimit();
  bad.answers[0].quote.text = "await rateLimit(req)";
  await save("bad.json", bad);
  const r = await lc("add-findings", "bad.json");
  assert.equal(r.code, 2);
  assert.match(r.err, /is not on line 3 of api\/chat\.js/);
});

test("a failing answer needs a finding, a choice check needs options, a finding needs a quote", async () => {
  const noFinding = { ...goodRateLimit(), findings: [] };
  await save("bad.json", noFinding);
  assert.match((await lc("add-findings", "bad.json")).err, /needs at least one finding/);
  const noOptions = goodRateLimit();
  delete noOptions.findings[0].options;
  await save("bad.json", noOptions);
  assert.match((await lc("add-findings", "bad.json")).err, /needs 2 or 3 options/);
  const noQuote = goodRateLimit();
  noQuote.findings[0].quotes = [];
  await save("bad.json", noQuote);
  assert.match((await lc("add-findings", "bad.json")).err, /needs at least one quote/);
  const outside = goodRateLimit();
  outside.findings[0].quotes = [{ file: "../../etc/passwd", line: 1, text: "root" }];
  await save("bad.json", outside);
  assert.match((await lc("add-findings", "bad.json")).err, /outside the project/);
});

test("a correct review is accepted: the check fails, the finding carries its quotes", async () => {
  // wrapped in a Markdown code fence, the way a reviewer sometimes answers
  await writeFile(path.join(dir, "good.json"), "```json\n" + JSON.stringify(goodRateLimit()) + "\n```\n");
  const r = await lc("add-findings", "good.json");
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.reviewed[0].status, "fail");
  const st = await state();
  assert.equal(st.checks["sec.rate-limit"].status, "fail");
  const f = st.findings["f_sec.rate-limit_api-chat.js-rate-limit"];
  assert.equal(f.quotes[0].file, "api/chat.js");
  assert.equal(f.options.length, 2);
  assert.equal(st.reviewTasks.find((t) => t.checkId === "sec.rate-limit").status, "done");
  const report = await readFile(path.join(dir, ".launch-check", "report.md"), "utf8");
  assert.match(report, /From the code\*\* \(a separate reviewer/);
  assert.equal((await lc("add-findings", "good.json")).code, 2, "the same review can't be added twice");
});

test("unchanged code keeps its review; changed code asks for a new one", async () => {
  await lc("run", "--target", "local", "--mode", "full", "--only", "sec.rate-limit");
  assert.equal((await state()).reviewTasks.find((t) => t.checkId === "sec.rate-limit").status, "done", "same code, same rubric");
  const file = path.join(dir, "api", "chat.js");
  await writeFile(file, (await readFile(file, "utf8")).replace("export default", "// a rate limiter will go here\nexport default"));
  await lc("run", "--target", "local", "--mode", "full", "--only", "sec.rate-limit");
  assert.equal((await state()).reviewTasks.find((t) => t.checkId === "sec.rate-limit").status, "pending");
  assert.ok((await lc("summary")).out.reviewsPending.some((r) => r.checkId === "sec.rate-limit"));
});

test("quick mode prepares no reviews", async () => {
  const r = await lc("run", "--target", "local", "--mode", "quick");
  assert.deepEqual(r.out.reviewTasks, []);
});
