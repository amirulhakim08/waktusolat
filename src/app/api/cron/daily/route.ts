import { createAdminClient } from "@/lib/supabase/admin";
import { ensureZoneSchedules } from "@/lib/prayer/sync";
import { processDeletionQueue } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily maintenance (Vercel Cron, see vercel.json):
 *  - refresh official prayer schedules for every zone in use
 *  - release abandoned upload reservations + delete orphaned objects
 *  - prune stale display sessions and rate-limit rows
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = createAdminClient();
  const { data: mosques } = await db.from("mosques").select("zone_code").eq("status", "active");
  const zones = [...new Set((mosques ?? []).map((m) => m.zone_code as string))];
  const prayer: Record<string, unknown> = {};
  for (const zone of zones) prayer[zone] = await ensureZoneSchedules(zone, { daysAhead: 14 });

  const { data: released } = await db.rpc("cleanup_expired_reservations");
  const deletion = await processDeletionQueue(500);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  await db.from("display_sessions").delete().lt("last_heartbeat_at", monthAgo);
  await db.from("rate_limits").delete().lt("window_start", new Date(Date.now() - 86400_000).toISOString());
  return Response.json({ zones: prayer, released, deletion });
}
