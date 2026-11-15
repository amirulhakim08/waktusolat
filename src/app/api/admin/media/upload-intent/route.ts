import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { friendlyError } from "@/lib/errors";
import { uploadIntentSchema } from "@/lib/validation";
import { EXT_FOR } from "@/lib/media/detect";
import { MEDIA_BUCKET } from "@/lib/constants";

export const dynamic = "force-dynamic";

const bodySchema = uploadIntentSchema.extend({ mosque_id: z.string().uuid() });

/**
 * Step 1 of an upload: reserve quota atomically in the database, then hand
 * the browser a single-use signed URL for exactly that storage path.
 */
export async function POST(req: Request) {
  const { supabase, user } = await getSession();
  if (!supabase || !user) return Response.json({ error: "Sila log masuk." }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Permintaan tidak sah." }, { status: 400 });
  if (!(await rateLimit(`upload:${user.id}`, 60, 3600))) {
    return Response.json({ error: "Terlalu banyak muat naik. Cuba lagi sebentar." }, { status: 429 });
  }
  const { mosque_id, name, mime, size } = parsed.data;
  const kind = mime.startsWith("video/") ? "video" : "image";

  // reserve_media_upload re-checks permission, type, size limits and quota under a row lock.
  const { data, error } = await supabase.rpc("reserve_media_upload", {
    p_mosque_id: mosque_id, p_kind: kind, p_name: name, p_mime: mime, p_size: size, p_ext: EXT_FOR[mime],
  });
  if (error || !data?.[0]) {
    return Response.json({ error: friendlyError(error) }, { status: error?.message.includes("forbidden") ? 403 : 400 });
  }
  const reservation = data[0] as { asset_id: string; storage_path: string; expires_at: string };

  const { data: signed, error: signError } = await createAdminClient()
    .storage.from(MEDIA_BUCKET)
    .createSignedUploadUrl(reservation.storage_path);
  if (signError || !signed) {
    await createAdminClient().rpc("discard_media_reservation", { p_asset_id: reservation.asset_id });
    return Response.json({ error: "Gagal menyediakan muat naik." }, { status: 500 });
  }
  return Response.json({ asset_id: reservation.asset_id, upload_url: signed.signedUrl, expires_at: reservation.expires_at });
}
