import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "./supabase/admin";

/** Client IP as seen by Vercel's edge (first X-Forwarded-For hop). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

/**
 * DB-backed fixed-window limiter (works across serverless instances).
 * Returns true when the request is allowed.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_key: key.slice(0, 200),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (e) {
    // Fail open on limiter outage so legitimate users are not locked out,
    // but make the failure visible in logs.
    console.error("[rate-limit] unavailable", e);
    return true;
  }
}
