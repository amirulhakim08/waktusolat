import "server-only";
import { createAdminClient } from "./supabase/admin";

/** Deletes queued storage objects; keeps failures for retry. */
export async function processDeletionQueue(limit = 100): Promise<{ deleted: number; failed: number }> {
  const db = createAdminClient();
  const { data: rows } = await db
    .from("storage_deletion_queue")
    .select("id, bucket, path, attempts")
    .lt("attempts", 10)
    .order("created_at")
    .limit(limit);
  let deleted = 0;
  let failed = 0;
  for (const r of rows ?? []) {
    const { error } = await db.storage.from(r.bucket).remove([r.path]);
    if (error && !/not found/i.test(error.message)) {
      failed++;
      await db.from("storage_deletion_queue").update({ attempts: r.attempts + 1, last_error: error.message }).eq("id", r.id);
    } else {
      deleted++;
      await db.from("storage_deletion_queue").delete().eq("id", r.id);
    }
  }
  return { deleted, failed };
}
