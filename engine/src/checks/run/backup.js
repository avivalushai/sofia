import { guide, textOf } from "../../lib/guided.js";

const SCRIPTED = /pg_dump|mysqldump|mongodump|supabase\s+db\s+dump|pgbackrest|wal-g|litestream|firestore.*export|gcloud\s+firestore\s+export/i;

/** @type {import("../../types.js").Check} */
export default {
  id: "run.backup",
  layer: "mechanical",
  async run(ctx) {
    const config = await textOf(ctx.project, /(^|\/)(\.github\/workflows\/.+\.ya?ml|scripts\/.+|package\.json|vercel\.json|render\.yaml|fly\.toml|docker-compose\.ya?ml)$/i);
    if (SCRIPTED.test(config)) return [ctx.pass()];
    const d = ctx.project.deps;
    const provider = d.has("@supabase/supabase-js") ? "Supabase" : d.has("firebase") || d.has("firebase-admin") ? "Firebase" : d.has("@neondatabase/serverless") ? "Neon" : d.has("@planetscale/database") ? "PlanetScale" : d.has("mongodb") || d.has("mongoose") ? "MongoDB Atlas" : null;
    const steps = {
      Supabase: ["In the Supabase dashboard, open Database → Backups: the free plan has no automatic backups, Pro keeps 7 days", "On the free plan, add a weekly backup: I can add a GitHub Action that runs supabase db dump and stores the file", "Restore one backup into a test project once, to be sure it works"],
      Firebase: ["In the Google Cloud console, open Firestore → Disaster recovery and turn on scheduled backups (daily, keep 7)", "Restore one into a test database once, to be sure it works"],
      Neon: ["Neon keeps a restore window (1 day on free, 7+ on paid): check it under Settings → Storage", "For longer history, I can add a scheduled pg_dump to GitHub Actions"],
      PlanetScale: ["Open the database → Backups and check the schedule (daily on all paid plans)", "Restore one into a branch once, to be sure it works"],
      "MongoDB Atlas": ["Free clusters have no backups: in Atlas, check the cluster's Backup tab, or move to a paid tier", "Or I can add a scheduled mongodump to GitHub Actions"],
    }[provider] ?? ["Find out where the database lives and whether it backs up automatically", "Make sure at least daily backups are kept for a week", "Restore one into a test copy once, to be sure it works"];
    return [guide(ctx, {
      title: "Make sure the database is backed up",
      evidence: provider ? `the app uses ${provider}; whether backups are on is a setting in its dashboard` : "no backup job was found in the project; backups may be set up at the host",
      steps,
    })];
  },
};
