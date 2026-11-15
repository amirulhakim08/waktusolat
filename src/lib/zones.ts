import "server-only";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./env";

export interface Zone { code: string; state: string; name: string }

export async function listZones(): Promise<Zone[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("prayer_zones").select("code, state, name").eq("is_active", true).order("code");
  return (data ?? []) as Zone[];
}
