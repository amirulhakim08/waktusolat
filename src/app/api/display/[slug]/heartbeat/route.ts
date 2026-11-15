import { heartbeatSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Records that a browser display session is alive (not that a TV is powered). */
export async function POST(req: Request, ctx: RouteContext<"/api/display/[slug]/heartbeat">) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(null, { status: 204 });
  }
  const body = heartbeatSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid" }, { status: 400 });
  if (!(await rateLimit(`hb:${body.data.session_id}`, 4, 60))) return new Response(null, { status: 429 });

  const db = createAdminClient();
  const { data: mosque } = await db.from("mosques").select("id").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!mosque) return Response.json({ error: "not_found" }, { status: 404 });

  const { data: existing } = await db.from("display_sessions").select("mosque_id").eq("id", body.data.session_id).maybeSingle();
  if (existing && existing.mosque_id !== mosque.id) {
    // A session id is bound to one mosque; a TV switched mosque -> client must rotate its id.
    return Response.json({ error: "session_conflict" }, { status: 409 });
  }
  const { error } = await db.from("display_sessions").upsert({
    id: body.data.session_id,
    mosque_id: mosque.id,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    screen: body.data.screen,
    mode: body.data.mode,
    playlist_version: body.data.playlist_version,
    schedule_ok: body.data.schedule_ok,
    last_sync_at: body.data.last_sync_at,
    last_heartbeat_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[heartbeat]", error.message);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
