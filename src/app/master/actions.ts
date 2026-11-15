"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACT_AS_COOKIE, requireMaster } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { broadcastDisplayUpdate } from "@/lib/realtime";
import { sendEmail } from "@/lib/email";
import { publicEnv } from "@/lib/env";
import { slugSchema } from "@/lib/validation";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);

async function notifyApplicant(supabase: Awaited<ReturnType<typeof requireMaster>>["supabase"], applicationId: string, subject: string, body: string) {
  const { data } = await supabase.from("mosque_applications").select("email").eq("id", applicationId).maybeSingle();
  if (data?.email) await sendEmail(data.email, subject, `${body}\n\n${publicEnv().siteUrl}/login`);
}

export async function approveAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMaster();
  const id = uuid(str(fd, "application_id"));
  if (!id) return { ok: false, error: "Permohonan tidak sah." };
  const existing = uuid(str(fd, "existing_mosque_id"));
  let slug: string | null = null;
  if (!existing) {
    const parsed = slugSchema.safeParse(str(fd, "slug"));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    slug = parsed.data;
  }
  const { error } = await supabase.rpc("approve_application", {
    p_application_id: id,
    p_slug: slug,
    p_existing_mosque_id: existing,
    p_replace_admin: fd.get("replace_admin") === "on",
    p_note: str(fd, "note") || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  await notifyApplicant(supabase, id, "Permohonan WaktuSolat diluluskan",
    "Permohonan anda telah diluluskan. Anda kini boleh log masuk sebagai pentadbir masjid/surau.");
  revalidatePath("/master", "layout");
  redirect(`/master/approvals/${id}?done=approved`);
}

export async function rejectAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMaster();
  const id = uuid(str(fd, "application_id"));
  if (!id) return { ok: false, error: "Permohonan tidak sah." };
  const note = str(fd, "note");
  const { error } = await supabase.rpc("reject_application", { p_application_id: id, p_note: note });
  if (error) return { ok: false, error: friendlyError(error) };
  await notifyApplicant(supabase, id, "Permohonan WaktuSolat ditolak", `Permohonan anda tidak diluluskan.\n\nSebab: ${note}`);
  revalidatePath("/master", "layout");
  return { ok: true, message: "Permohonan ditolak dan pemohon dimaklumkan." };
}

export async function requestInfoAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMaster();
  const id = uuid(str(fd, "application_id"));
  if (!id) return { ok: false, error: "Permohonan tidak sah." };
  const note = str(fd, "note");
  const { error } = await supabase.rpc("request_application_info", { p_application_id: id, p_note: note });
  if (error) return { ok: false, error: friendlyError(error) };
  await notifyApplicant(supabase, id, "Maklumat tambahan diperlukan — WaktuSolat", `Pentadbir sistem memerlukan maklumat tambahan:\n\n${note}`);
  revalidatePath("/master", "layout");
  return { ok: true, message: "Permintaan maklumat dihantar kepada pemohon." };
}

export async function setMosqueStatusAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMaster();
  const id = uuid(str(fd, "mosque_id"));
  const status = str(fd, "status");
  if (!id || !["active", "suspended"].includes(status)) return { ok: false, error: "Permintaan tidak sah." };
  const reason = str(fd, "reason");
  if (status === "suspended" && reason.length < 5) return { ok: false, error: "Sila nyatakan sebab penggantungan." };
  const { error } = await supabase.rpc("set_mosque_status", { p_mosque_id: id, p_status: status, p_reason: reason || null });
  if (error) return { ok: false, error: friendlyError(error) };
  await broadcastDisplayUpdate(id, "settings");
  revalidatePath("/master", "layout");
  return { ok: true, message: status === "suspended" ? "Masjid digantung." : "Masjid diaktifkan semula." };
}

export async function revokeAdminAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMaster();
  const id = uuid(str(fd, "mosque_id"));
  if (!id) return { ok: false, error: "Permintaan tidak sah." };
  const { error } = await supabase.rpc("revoke_mosque_admin", { p_mosque_id: id, p_reason: str(fd, "reason") });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/master", "layout");
  return { ok: true, message: "Akses pentadbir telah ditarik balik. Pentadbir baharu boleh dilantik melalui permohonan baharu." };
}

export async function setQuotaAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMaster();
  const id = uuid(str(fd, "mosque_id"));
  const mb = Number(str(fd, "quota_mb"));
  if (!id || !Number.isFinite(mb) || mb < 1 || mb > 10240) return { ok: false, error: "Kuota mesti antara 1 MB dan 10240 MB." };
  const { error } = await supabase.rpc("set_mosque_quota", { p_mosque_id: id, p_bytes: Math.round(mb * 1024 * 1024) });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/master", "layout");
  return { ok: true, message: `Kuota dikemas kini kepada ${mb} MB.` };
}

export async function setSlugAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMaster();
  const id = uuid(str(fd, "mosque_id"));
  const parsed = slugSchema.safeParse(str(fd, "slug"));
  if (!id || !parsed.success) return { ok: false, error: parsed.success ? "Permintaan tidak sah." : parsed.error.issues[0].message };
  const { error } = await supabase.rpc("set_mosque_slug", { p_mosque_id: id, p_slug: parsed.data });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/master", "layout");
  return { ok: true, message: "Pautan awam dikemas kini. Pautan lama akan dialihkan secara automatik." };
}

/** Lets the Master open /admin for a specific mosque (RLS still applies). */
export async function actAsMosqueAction(fd: FormData) {
  await requireMaster();
  const id = uuid(str(fd, "mosque_id"));
  if (!id) return;
  (await cookies()).set(ACT_AS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
  redirect("/admin");
}

export async function stopActingAction() {
  (await cookies()).delete(ACT_AS_COOKIE);
  redirect("/master/mosques");
}

export async function updateSystemSettingsAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireMaster();
  const num = (k: string) => Number(str(fd, k));
  const quotaMb = num("default_quota_mb");
  const videoMb = num("max_video_mb");
  if (!(quotaMb >= 1 && quotaMb <= 10240) || !(videoMb >= 1 && videoMb <= 500)) {
    return { ok: false, error: "Nilai kuota/saiz tidak sah." };
  }
  const prayers = ["subuh", "zohor", "asar", "maghrib", "isyak", "jumaat"] as const;
  const defaults: Record<string, unknown> = {};
  for (const p of prayers) {
    const cd = num(`${p}_countdown`);
    const so = num(`${p}_solat`);
    if (!(cd >= 1 && cd <= 120 && so >= 1 && so <= 120)) return { ok: false, error: `Tempoh untuk ${p} tidak sah.` };
    defaults[p] = { enabled: fd.get(`${p}_enabled`) === "on", countdown_minutes: cd, solat_minutes: so, ...(p === "jumaat" ? { replaces_zohor: true } : {}) };
  }
  const duration = num("default_slide_duration_seconds");
  const transitionMs = num("default_transition_ms");
  if (!(duration >= 3 && duration <= 3600) || !(transitionMs >= 0 && transitionMs <= 3000) || transitionMs >= duration * 1000) {
    return { ok: false, error: "Tetapan slaid lalai tidak sah." };
  }
  const { error } = await supabase.from("system_settings").update({
    default_storage_quota_bytes: Math.round(quotaMb * 1024 * 1024),
    max_video_bytes: Math.round(videoMb * 1024 * 1024),
    default_prayer_mode: defaults,
    default_slide_duration_seconds: duration,
    default_transition: str(fd, "default_transition"),
    default_transition_ms: transitionMs,
    default_fit: str(fd, "default_fit"),
    updated_by: user.id,
  }).eq("id", 1);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/master/settings");
  return { ok: true, message: "Tetapan sistem disimpan. Nilai lalai digunakan untuk masjid yang diluluskan selepas ini." };
}

export async function markNotificationsReadAction() {
  const { supabase, user } = await requireMaster();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/master");
}
