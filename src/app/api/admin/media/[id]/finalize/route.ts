import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/errors";
import { finalizeSchema } from "@/lib/validation";
import { MediaValidationError, processUpload } from "@/lib/media/process";
import { processDeletionQueue } from "@/lib/storage";
import { MEDIA_BUCKET } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Step 2 of an upload: verify the stored bytes server-side (magic bytes,
 * codec, real size), optimise images, then mark the asset ready. Optionally
 * adds it to a playlist with its per-item display settings.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/media/[id]/finalize">) {
  const { id } = await ctx.params;
  const { supabase, user } = await getSession();
  if (!supabase || !user) return Response.json({ error: "Sila log masuk." }, { status: 401 });
  const body = finalizeSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });

  // RLS: only visible if the caller manages this asset's mosque.
  const { data: asset } = await supabase.from("media_assets").select("*").eq("id", id).maybeSingle();
  if (!asset) return Response.json({ error: "Media tidak dijumpai." }, { status: 404 });

  const admin = createAdminClient();
  if (asset.status !== "ready") {
    const discard = async (msg: string, status = 400) => {
      await admin.rpc("discard_media_reservation", { p_asset_id: id });
      await processDeletionQueue(5);
      return Response.json({ error: msg }, { status });
    };
    const { data: blob, error: dlError } = await admin.storage.from(MEDIA_BUCKET).download(asset.storage_path);
    if (dlError || !blob) return discard("Fail tidak ditemui dalam storan. Sila muat naik semula.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > Number(asset.size_bytes)) {
      return discard("Saiz fail tidak sepadan dengan yang diisytiharkan.");
    }
    let processed;
    try {
      processed = await processUpload(bytes, asset.mime_type);
    } catch (e) {
      return discard(e instanceof MediaValidationError ? e.message : "Fail tidak dapat diproses.");
    }
    if (processed.replaced) {
      const up = await admin.storage.from(MEDIA_BUCKET).upload(asset.storage_path, processed.bytes, {
        contentType: processed.mime, upsert: true, cacheControl: "31536000",
      });
      if (up.error) return discard("Gagal menyimpan gambar yang dioptimumkan.", 500);
    }
    const { error } = await admin.rpc("finalize_media_upload", {
      p_asset_id: id,
      p_actual_size: processed.bytes.byteLength,
      p_mime: processed.mime,
      p_width: processed.width,
      p_height: processed.height,
      p_duration: null,
      p_sha256: processed.sha256,
      p_metadata: processed.metadata,
    });
    if (error) return discard(friendlyError(error));
  }

  if (body.data.playlist_id) {
    const s = body.data.settings ?? { duration_seconds: 10, transition: "fade", transition_ms: 1000, fit: "contain", is_active: true };
    const { data: last } = await supabase
      .from("playlist_items").select("position").eq("playlist_id", body.data.playlist_id)
      .order("position", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("playlist_items").insert({
      playlist_id: body.data.playlist_id,
      mosque_id: asset.mosque_id,
      media_id: id,
      position: (last?.position ?? -1) + 1,
      ...s,
    });
    if (error) return Response.json({ ok: true, warning: `Media disimpan tetapi tidak ditambah ke playlist: ${friendlyError(error)}` });
  }
  return Response.json({ ok: true });
}
