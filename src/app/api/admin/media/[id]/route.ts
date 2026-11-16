import { getSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { processDeletionQueue } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/media/[id]">) {
  const { id } = await ctx.params;
  const { supabase, user } = await getSession();
  if (!supabase || !user) return Response.json({ error: "Sila log masuk." }, { status: 401 });
  // delete_media_asset checks tenancy, playlist usage and live publication.
  const { error } = await supabase.rpc("delete_media_asset", { p_asset_id: id });
  if (error) return Response.json({ error: friendlyError(error) }, { status: 400 });
  await processDeletionQueue(10).catch(() => undefined);
  return Response.json({ ok: true });
}
