import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { klDateString } from "@/lib/time";
import { DB_SCHEMA, MEDIA_BUCKET } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Public, read-only display payload. Uses the anon key and the
 * get_public_display() function, which returns ONLY published data for an
 * active mosque. Short CDN caching protects the database when many TVs poll.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/display/[slug]">) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return Response.json({ error: "not_found" }, { status: 404 });
  if (!isSupabaseConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });

  const { supabaseUrl, supabaseAnonKey } = publicEnv();
  const db = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false }, db: { schema: DB_SCHEMA } });
  const load = async () => {
    const { data, error } = await db.rpc("get_public_display", { p_slug: slug });
    if (error) throw error;
    return data as Record<string, unknown> | null;
  };

  try {
    let data = await load();
    if (!data) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=30" } });
    if (data.redirect || data.unavailable) {
      return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=30" } });
    }

    // Lazily fetch official schedules if today's is missing (rate-limited per zone).
    const schedules = (data.schedules as { date: string }[]) ?? [];
    const today = klDateString(Date.now());
    if (!schedules.some((s) => s.date === today) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { ensureZoneSchedules } = await import("@/lib/prayer/sync");
      const zone = (data.mosque as { zone: string }).zone;
      const r = await ensureZoneSchedules(zone);
      if (r.ok && r.fetched) data = (await load()) ?? data;
    }

    return Response.json(
      { ...data, media_base: `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/` },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } },
    );
  } catch (e) {
    console.error("[display] payload error", e);
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
