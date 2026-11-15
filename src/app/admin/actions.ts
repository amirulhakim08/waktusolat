"use server";
/**
 * Mosque admin server actions. The mosque id is ALWAYS derived server-side
 * from the session (requireMosqueAdmin) — never from client input — and
 * every query additionally runs under RLS as the signed-in user.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMosqueAdmin, requireUser } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { broadcastDisplayUpdate } from "@/lib/realtime";
import {
  displaySettingsSchema, itemSettingsSchema, overrideSchema, passwordSchema, phoneSchema, prayerModeRowSchema, slugSchema, zoneCode,
} from "@/lib/validation";
import { MALAYSIAN_STATES } from "@/lib/constants";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fail = (e: unknown): ActionResult => ({ ok: false, error: friendlyError(e) });

// ---------------------------------------------------------------- profile
const profileSchema = z.object({
  name: z.string().trim().min(3, "Nama terlalu pendek").max(150),
  address: z.string().trim().max(500),
  state: z.enum(MALAYSIAN_STATES, { message: "Sila pilih negeri" }),
  district: z.string().trim().max(80),
  zone_code: zoneCode,
});

export async function updateMosqueProfileAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, mosqueId, mosque } = await requireMosqueAdmin();
  const parsed = profileSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await supabase.from("mosques").update(parsed.data).eq("id", mosqueId);
  if (error) return fail(error);

  const slug = str(fd, "slug").toLowerCase();
  if (slug && slug !== mosque.slug) {
    const s = slugSchema.safeParse(slug);
    if (!s.success) return { ok: false, error: s.error.issues[0].message };
    const { error: slugErr } = await supabase.rpc("set_mosque_slug", { p_mosque_id: mosqueId, p_slug: s.data });
    if (slugErr) return fail(slugErr);
  }
  if (parsed.data.zone_code !== mosque.zone_code && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { ensureZoneSchedules } = await import("@/lib/prayer/sync");
    await ensureZoneSchedules(parsed.data.zone_code);
  }
  await broadcastDisplayUpdate(mosqueId, "settings");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Profil masjid disimpan." };
}

export async function setLogoAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const id = str(fd, "logo_asset_id");
  const { error } = await supabase.from("mosques").update({ logo_asset_id: id || null }).eq("id", mosqueId);
  if (error) return fail(error);
  await broadcastDisplayUpdate(mosqueId, "settings");
  revalidatePath("/admin", "layout");
  return { ok: true, message: id ? "Logo dikemas kini." : "Logo dibuang." };
}

// ---------------------------------------------------------------- media
export async function renameMediaAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const name = str(fd, "name");
  if (name.length < 1 || name.length > 120) return { ok: false, error: "Nama tidak sah." };
  const { error } = await supabase.from("media_assets").update({ name }).eq("id", str(fd, "media_id")).eq("mosque_id", mosqueId);
  if (error) return fail(error);
  revalidatePath("/admin/media");
  return { ok: true, message: "Nama disimpan." };
}

// ---------------------------------------------------------------- playlists
export async function createPlaylistAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const name = str(fd, "name");
  if (name.length < 1 || name.length > 80) return { ok: false, error: "Nama playlist tidak sah." };
  const { error } = await supabase.from("playlists").insert({ mosque_id: mosqueId, name });
  if (error) return fail(error);
  revalidatePath("/admin/playlist");
  return { ok: true, message: "Playlist dicipta." };
}

export async function deletePlaylistAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const { count } = await supabase.from("playlists").select("id", { count: "exact", head: true }).eq("mosque_id", mosqueId);
  if ((count ?? 0) <= 1) return { ok: false, error: "Sekurang-kurangnya satu playlist diperlukan." };
  const { error } = await supabase.from("playlists").delete().eq("id", str(fd, "playlist_id")).eq("mosque_id", mosqueId);
  if (error) return fail(error);
  revalidatePath("/admin/playlist");
  return { ok: true, message: "Playlist dipadam. Versi yang telah diterbitkan kekal dalam sejarah." };
}

const draftSchema = z.object({
  playlist_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  items: z.array(z.object({ id: z.string().uuid() }).and(itemSettingsSchema)).max(200),
});

/** Saves order + per-item settings in one go ("Simpan Draf"). */
export async function savePlaylistDraftAction(payload: unknown): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const parsed = draftSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data playlist tidak sah." };
  const { playlist_id, items, name } = parsed.data;

  const { data: pl } = await supabase.from("playlists").select("id").eq("id", playlist_id).eq("mosque_id", mosqueId).maybeSingle();
  if (!pl) return { ok: false, error: "Playlist tidak dijumpai." };
  await supabase.from("playlists").update({ name }).eq("id", playlist_id);

  const { data: existing } = await supabase.from("playlist_items").select("id").eq("playlist_id", playlist_id);
  const keep = new Set(items.map((i) => i.id));
  const remove = (existing ?? []).map((r) => r.id).filter((id) => !keep.has(id));
  if (remove.length) {
    const { error } = await supabase.from("playlist_items").delete().in("id", remove);
    if (error) return fail(error);
  }
  for (const [position, item] of items.entries()) {
    const { id, ...settings } = item;
    const { error } = await supabase.from("playlist_items").update({ ...settings, position }).eq("id", id).eq("playlist_id", playlist_id);
    if (error) return fail(error);
  }
  revalidatePath("/admin/playlist");
  return { ok: true, message: "Draf disimpan. Paparan TV belum berubah sehingga anda menekan “Terbitkan ke TV”." };
}

export async function addToPlaylistAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const playlistId = str(fd, "playlist_id");
  const mediaIds = fd.getAll("media_id").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v));
  if (!mediaIds.length) return { ok: false, error: "Pilih sekurang-kurangnya satu media." };
  const [{ data: last }, { data: defaults }] = await Promise.all([
    supabase.from("playlist_items").select("position").eq("playlist_id", playlistId).order("position", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("system_settings").select("default_slide_duration_seconds, default_transition, default_transition_ms, default_fit").eq("id", 1).single(),
  ]);
  let pos = (last?.position ?? -1) + 1;
  const rows = mediaIds.map((media_id) => ({
    playlist_id: playlistId, mosque_id: mosqueId, media_id, position: pos++,
    duration_seconds: defaults?.default_slide_duration_seconds ?? 10,
    transition: defaults?.default_transition ?? "fade",
    transition_ms: defaults?.default_transition_ms ?? 1000,
    fit: defaults?.default_fit ?? "contain",
  }));
  const { error } = await supabase.from("playlist_items").insert(rows);
  if (error) return fail(error);
  revalidatePath("/admin/playlist");
  return { ok: true, message: `${rows.length} media ditambah ke playlist.` };
}

export async function publishPlaylistAction(playlistId: string): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const { data, error } = await supabase.rpc("publish_playlist", { p_playlist_id: playlistId });
  if (error) return fail(error);
  await broadcastDisplayUpdate(mosqueId, "publish");
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Playlist versi ${data} diterbitkan ke TV.` };
}

// ---------------------------------------------------------------- prayer mode
const prayerRowsSchema = z.array(prayerModeRowSchema).length(6);

export async function savePrayerModeAction(rows: unknown, publish: boolean): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const parsed = prayerRowsSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: `Tetapan tidak sah: ${parsed.error.issues[0]?.message}` };
  for (const r of parsed.data) {
    const { prayer, ...values } = r;
    const { error } = await supabase.from("prayer_mode_settings").update(values).eq("mosque_id", mosqueId).eq("prayer", prayer);
    if (error) return fail(error);
  }
  if (publish) {
    const { error } = await supabase.rpc("publish_prayer_mode", { p_mosque_id: mosqueId });
    if (error) return fail(error);
    await broadcastDisplayUpdate(mosqueId, "publish");
  }
  revalidatePath("/admin/prayer-mode");
  return { ok: true, message: publish ? "Tetapan Mod Solat diterbitkan ke TV." : "Draf disimpan (belum diterbitkan)." };
}

export async function overrideAction(input: unknown): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Tetapan kawalan manual tidak sah." };
  const v = parsed.data;
  const { error } = await supabase.rpc("create_prayer_override", {
    p_mosque_id: mosqueId, p_kind: v.kind, p_prayer: v.prayer,
    p_countdown_minutes: v.countdown_minutes, p_solat_minutes: v.solat_minutes, p_normal_minutes: v.normal_minutes ?? 30,
  });
  if (error) return fail(error);
  await broadcastDisplayUpdate(mosqueId, "override");
  revalidatePath("/admin/prayer-mode");
  const msg = { countdown: "Countdown dimulakan di semua paparan.", solat: "Mod Solat dimulakan di semua paparan.", normal: "Mod Solat ditamatkan." }[v.kind];
  return { ok: true, message: msg };
}

export async function clearOverrideAction(): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const { error } = await supabase.rpc("clear_prayer_override", { p_mosque_id: mosqueId });
  if (error) return fail(error);
  await broadcastDisplayUpdate(mosqueId, "override");
  revalidatePath("/admin/prayer-mode");
  return { ok: true, message: "Kembali ke jadual automatik." };
}

// ---------------------------------------------------------------- display settings
export async function saveDisplaySettingsAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const parsed = displaySettingsSchema.safeParse({
    clock_format: str(fd, "clock_format"),
    show_seconds: fd.get("show_seconds") === "on",
    show_hijri: fd.get("show_hijri") === "on",
    solat_screen_style: str(fd, "solat_screen_style"),
    solat_title: str(fd, "solat_title"),
    solat_subtitle: str(fd, "solat_subtitle"),
    countdown_subtitle: str(fd, "countdown_subtitle"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await supabase.from("display_settings").update(parsed.data).eq("mosque_id", mosqueId);
  if (error) return fail(error);
  const publish = str(fd, "intent") === "publish";
  if (publish) {
    const { error: pubErr } = await supabase.rpc("publish_display_settings", { p_mosque_id: mosqueId });
    if (pubErr) return fail(pubErr);
    await broadcastDisplayUpdate(mosqueId, "publish");
  }
  revalidatePath("/admin/display-settings");
  return { ok: true, message: publish ? "Tetapan paparan diterbitkan ke TV." : "Draf disimpan." };
}

// ---------------------------------------------------------------- account
export async function updateAccountAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const name = str(fd, "full_name");
  const phone = phoneSchema.safeParse(str(fd, "phone"));
  if (name.length < 3 || name.length > 120) return { ok: false, error: "Nama tidak sah." };
  if (!phone.success) return { ok: false, error: phone.error.issues[0].message };
  const { error } = await supabase.from("profiles").update({ full_name: name, phone: phone.data }).eq("id", user.id);
  if (error) return fail(error);
  revalidatePath("/admin/account");
  return { ok: true, message: "Maklumat akaun disimpan." };
}

export async function changePasswordAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const current = str(fd, "current_password");
  const next = passwordSchema.safeParse(String(fd.get("new_password") ?? ""));
  if (!next.success) return { ok: false, error: next.error.issues[0].message };
  if (next.data !== String(fd.get("confirm_password") ?? "")) return { ok: false, error: "Kata laluan baharu tidak sepadan." };
  // Re-authenticate before changing the password.
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email ?? "", password: current });
  if (authErr) return { ok: false, error: "Kata laluan semasa tidak betul." };
  const { error } = await supabase.auth.updateUser({ password: next.data });
  if (error) return { ok: false, error: "Kata laluan tidak dapat ditukar. Cuba kata laluan yang lebih kuat." };
  return { ok: true, message: "Kata laluan ditukar." };
}
