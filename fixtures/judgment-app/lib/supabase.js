// cost.free-tier — the free Supabase plan pauses the project after a week without activity, and has no backups
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
