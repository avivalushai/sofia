import { test } from "node:test";
import assert from "node:assert/strict";
import { blockedAgents } from "../src/checks/seo/robots.js";
import { findSecrets } from "../src/lib/secrets.js";
import { findTypos, words } from "../src/lib/spell.js";
import { editDistance, slugKey } from "../src/lib/text.js";
import { isLocalHost, registrableDomain } from "../src/lib/net.js";
import { stripStrings } from "../src/lib/code.js";

test("robots.txt: only a full block for all crawlers or Google counts", () => {
  assert.deepEqual(blockedAgents("User-agent: *\nDisallow: /"), ["*"]);
  assert.deepEqual(blockedAgents("User-agent: *\nAllow: /"), []);
  assert.deepEqual(blockedAgents("User-agent: *\nDisallow: /admin"), []);
  assert.deepEqual(blockedAgents("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /"), []);
  assert.deepEqual(blockedAgents("User-agent: Googlebot\nUser-agent: Bingbot\nDisallow: / # all"), ["googlebot", "bingbot"]);
});

test("secrets: real secret shapes are found, public keys are not", () => {
  const found = (s) => findSecrets(s).map((h) => h.pattern.id);
  assert.deepEqual(found('k = "sk_live_FAKEFAKEFAKEFAKEFAKE0000"'), ["stripe"]);
  assert.deepEqual(found("sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123"), ["anthropic"]);
  assert.deepEqual(found("sk-proj-abcdefghijklmnopqrstuvwxyz0123456789AB"), ["openai"]);
  assert.deepEqual(found("AKIAABCDEFGHIJKLMNOP"), ["aws"]);
  assert.deepEqual(found("pk_live_abcdefghijklmnopqrstuvwx"), [], "publishable Stripe key is meant to be public");
  assert.deepEqual(found("AIzaSyA-abcdefghijklmnopqrstuvwxyz12345"), [], "Firebase/Google browser key is meant to be public");
  const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url")}.abcdefghijklmnopqrstuvwxyz`;
  assert.deepEqual(found(jwt("service_role")), ["supabase-service"]);
  assert.deepEqual(found(jwt("anon")), [], "the anon key is meant to be public");
});

test("spelling: Hebrew and English typos with a near match are flagged; names and repeats are not", async () => {
  const typos = await findTypos([
    "שיעורי פילאטיס בקבוצות קטנות",
    "פילאטיס עם נועה",
    "פילאטיס עם נועה",
    "הרשמה לשיעור פלאטיס", // spelled differently from a word the site repeats
    "שלחח לחבר", // a doubled letter
    "מחיר לחודש בקבצות", // with or without ו: a spelling variant, not flagged
    "מירוץ בפארק", "למירוץ", "הנהוראים", "נהוראי", "נהוראי", // prefixes, variants and forms of a repeated name
    "We recieve your message within a day",
    "Contact Noa at Studio Zen", // capitalised: treated as names
    "Lorem ipsum dolor sit amet", // left to content.placeholders
    'כל המחירים כוללים מע"מ',
  ]);
  assert.deepEqual(typos.map((t) => t.word).sort(), ["פלאטיס", "שלחח", "recieve"].sort());
  assert.equal(typos.find((t) => t.word === "שלחח").suggestion, "שלח");
  assert.equal(typos.find((t) => t.word === "פלאטיס").suggestion, "פילאטיס");
  assert.equal(typos.find((t) => t.word === "recieve").suggestion, "receive");
});

test("spelling: abbreviations and code-like strings are not words", () => {
  assert.deepEqual(words('מע"מ צ\'ק test@example.com a/b API'), []);
});

test("slugKey: readable and stable", () => {
  assert.equal(slugKey("/"), "home");
  assert.equal(slugKey("/_lorem"), "home_lorem");
  assert.equal(slugKey("/pricing.html"), "pricing.html");
  assert.equal(slugKey("src/a.js#abc123"), "src-a.js-abc123");
  assert.match(slugKey("/שלום"), /^x-[0-9a-f]{6}$|^-?[0-9a-f]{6}$|-[0-9a-f]{6}$/);
  assert.notEqual(slugKey("/שלום"), slugKey("/עולם"));
});

test("editDistance handles swaps as one edit", () => {
  assert.equal(editDistance("recieve", "receive", 1), 1);
  assert.equal(editDistance("abc", "abc"), 0);
  assert.ok(editDistance("abc", "xyz", 1) > 1);
});

test("local addresses are recognised", () => {
  for (const h of ["localhost", "127.0.0.1", "192.168.1.5", "10.0.0.2", "app.localhost", "[::1]", "my.test"]) assert.ok(isLocalHost(h), h);
  for (const h of ["example.com", "8.8.8.8", "noa-pilates.vercel.app"]) assert.ok(!isLocalHost(h), h);
  assert.equal(registrableDomain("www.noa.co.il"), "noa.co.il");
  assert.equal(registrableDomain("app.example.com"), "example.com");
});

test("stripStrings leaves only identifiers", () => {
  assert.equal(stripStrings('console.log("signup user", data)'), 'console.log("", data)');
});
