import { scanSource } from "../../lib/code.js";
import { lineAt } from "../../lib/text.js";

const SERVER_ONLY = ["prisma", "@prisma/client", "drizzle-orm", "mongoose", "mongodb", "pg", "postgres", "mysql2", "better-sqlite3", "sqlite3", "@libsql/client", "kysely", "typeorm", "sequelize", "@vercel/postgres", "@planetscale/database", "@neondatabase/serverless"];
const CLIENT_DB = ["@supabase/supabase-js", "firebase", "pocketbase", "appwrite", "@instantdb/react"];

const OPEN_FIX = "1. I'll add access rules so each person can only read and change their own rows. 2. Before I deploy them, tell me which data should stay public (for example a price list). 3. After deploying, I'll re-check by trying to read without logging in.";

/** Supabase migrations: tables created without row level security. */
async function supabaseTables(ctx) {
  const results = [];
  const sqlFiles = ctx.project.files.filter((f) => /(^|\/)supabase\/(migrations\/.*|schema)\.sql$/.test(f) || /(^|\/)supabase\/migrations\/.+\.sql$/.test(f));
  if (!sqlFiles.length) return null;
  const all = [];
  for (const f of sqlFiles) all.push({ f, text: (await ctx.project.read(f)) ?? "" });
  const sql = all.map((x) => x.text).join("\n");
  for (const { f, text } of all) {
    for (const m of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      const table = m[1];
      const rls = new RegExp(`alter\\s+table\\s+(?:only\\s+)?(?:"?public"?\\.)?"?${table}"?\\s+enable\\s+row\\s+level\\s+security`, "i");
      if (rls.test(sql)) continue;
      results.push(ctx.fail({
        key: `supabase_${table}`,
        title: "Anyone can read and change a database table",
        impact: "Without access rules, anyone with your site's public key — which is in every visitor's browser — can read, change or delete this table",
        location: { file: f, line: lineAt(text, m.index) },
        evidence: `Table "${table}" is created without row level security`,
        fix: OPEN_FIX,
        options: [
          { label: "Each person sees only their own rows", detail: "Right for profiles, orders, messages" },
          { label: "Everyone can read, only owners can change", detail: "Right for public listings" },
        ],
      }));
    }
  }
  return results;
}

/** Firebase rules files that allow everyone. */
async function firebaseRules(ctx) {
  const files = ctx.project.files.filter((f) => /(^|\/)(firestore|storage)\.rules$|(^|\/)database\.rules\.json$/.test(f));
  if (!files.length) return null;
  const results = [];
  for (const f of files) {
    const text = (await ctx.project.read(f)) ?? "";
    const m = text.match(/allow\s+(?:read|write|get|list|create|update|delete)(?:\s*,\s*\w+)*\s*:\s*if\s+true\b|allow\s+read\s*,\s*write\s*;|"\.(?:read|write)"\s*:\s*true/);
    if (!m) continue;
    results.push(ctx.fail({
      key: `firebase_${f}`,
      title: "Anyone can read and change the database",
      impact: "The access rules let anyone on the internet read, change or delete your data, without logging in",
      location: { file: f, line: lineAt(text, m.index) },
      evidence: `${f}: ${m[0]}`,
      fix: OPEN_FIX,
      options: [
        { label: "Each person sees only their own data", detail: "Right for profiles, orders, messages" },
        { label: "Everyone can read, only owners can change", detail: "Right for public listings" },
      ],
    }));
  }
  return results;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "sec.open-db",
  layer: "mechanical",
  async run(ctx) {
    const usesClientDb = CLIENT_DB.some((d) => ctx.project.deps.has(d)) || (await scanSource(ctx.project, /from ["']firebase\/(firestore|database)["']|createClient\(/g)).length > 0;
    if (!usesClientDb && SERVER_ONLY.some((d) => ctx.project.deps.has(d))) return [ctx.pass()]; // only the server talks to the database

    const supa = await supabaseTables(ctx);
    const fire = await firebaseRules(ctx);
    if (supa === null && fire === null) {
      return [ctx.uncertain({
        key: "rules",
        title: "Couldn't see who's allowed into the database",
        evidence: "The browser talks to the database directly, but no access rules are saved in the project — they may exist only in the database dashboard",
        fix: "Open your database dashboard and check every table has access rules turned on (Supabase: Authentication → Policies; Firebase: Firestore → Rules)",
      })];
    }
    const results = [...(supa ?? []), ...(fire ?? [])];
    return results.length ? results : [ctx.pass()];
  },
};
