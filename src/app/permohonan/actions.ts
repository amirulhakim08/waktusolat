"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";

export async function respondInfoAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("respond_application_info", {
    p_application_id: String(fd.get("application_id")),
    p_response: String(fd.get("response") ?? "").trim(),
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/permohonan");
  return { ok: true, message: "Maklum balas dihantar. Permohonan anda akan disemak semula." };
}
