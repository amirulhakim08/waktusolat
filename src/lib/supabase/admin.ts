import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serviceRoleKey } from "../env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — use ONLY on the server, ONLY after
 * the caller has been authorised, and never return its results unfiltered.
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(publicEnv().supabaseUrl, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
