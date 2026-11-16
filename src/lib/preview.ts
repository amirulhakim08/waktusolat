import "server-only";
import type { createClient } from "./supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
import type { DisplayPayload } from "@/components/display/types";
import type { DaySchedule, PrayerModeConfig, PrayerModeKey, PrayerOverride } from "./prayer/types";
import type { SlideItem } from "./slideshow";
import type { MosqueRow } from "./auth";
import { addDays, klDateString } from "./time";
import { publicEnv } from "./env";
import { MEDIA_BUCKET } from "./constants";

export async function loadSchedules(supabase: SupabaseClient, zone: string, from: string, to: string): Promise<DaySchedule[]> {
  const { data } = await supabase.from("prayer_schedules")
    .select("date, hijri_date, subuh, syuruk, zohor, asar, maghrib, isyak, source, fetched_at")
    .eq("zone_code", zone).gte("date", from).lte("date", to).order("date");
  const t = (v: string) => String(v).slice(0, 5);
  return (data ?? []).map((d) => ({
    date: d.date, hijri: d.hijri_date, subuh: t(d.subuh), syuruk: t(d.syuruk), zohor: t(d.zohor),
    asar: t(d.asar), maghrib: t(d.maghrib), isyak: t(d.isyak), source: d.source, fetched_at: d.fetched_at,
  }));
}

/** Builds a display payload from DRAFT data, for the admin preview only. */
export async function buildDraftPayload(
  supabase: SupabaseClient, mosque: MosqueRow,
  opts: { playlistId?: string | null; simulate?: "countdown" | "solat" | null; prayer?: PrayerModeKey | null },
): Promise<DisplayPayload> {
  const today = klDateString(Date.now());
  const playlistQuery = supabase.from("playlists").select("id").eq("mosque_id", mosque.id);
  const { data: pls } = opts.playlistId ? await playlistQuery.eq("id", opts.playlistId) : await playlistQuery.order("created_at").limit(1);
  const playlistId = pls?.[0]?.id;
  const [{ data: items }, { data: pm }, { data: ds }, schedules, { data: logo }] = await Promise.all([
    playlistId
      ? supabase.from("playlist_items").select("id, duration_seconds, transition, transition_ms, fit, media:media_assets(id, name, kind, storage_path, mime_type, size_bytes, width, height)").eq("playlist_id", playlistId).eq("is_active", true).order("position")
      : Promise.resolve({ data: [] }),
    supabase.from("prayer_mode_settings").select("*").eq("mosque_id", mosque.id),
    supabase.from("display_settings").select("*").eq("mosque_id", mosque.id).maybeSingle(),
    loadSchedules(supabase, mosque.zone_code, addDays(today, -1), addDays(today, 7)),
    mosque.logo_asset_id ? supabase.from("media_assets").select("storage_path").eq("id", mosque.logo_asset_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  type Row = { id: string; duration_seconds: number; transition: SlideItem["transition"]; transition_ms: number; fit: SlideItem["fit"]; media: { id: string; name: string; kind: "image" | "video"; storage_path: string; mime_type: string; size_bytes: number; width: number | null; height: number | null } };
  const slides: SlideItem[] = ((items ?? []) as unknown as Row[]).map((r) => ({
    item_id: r.id, media_id: r.media.id, kind: r.media.kind, name: r.media.name, path: r.media.storage_path, mime: r.media.mime_type,
    size: Number(r.media.size_bytes), width: r.media.width, height: r.media.height,
    duration_seconds: r.duration_seconds, transition: r.transition, transition_ms: r.transition_ms, fit: r.fit,
  }));
  const config: PrayerModeConfig = {};
  for (const r of pm ?? []) config[r.prayer as PrayerModeKey] = r;

  const overrides: PrayerOverride[] = [];
  if (opts.simulate) {
    const prayer = opts.prayer ?? "maghrib";
    const c = config[prayer] ?? { countdown_minutes: 5, solat_minutes: 5, enabled: true };
    const now = Date.now();
    const cdEnd = opts.simulate === "countdown" ? now + c.countdown_minutes * 60_000 : null;
    overrides.push({
      kind: opts.simulate, prayer, starts_at: new Date(now - 1000).toISOString(),
      countdown_ends_at: cdEnd ? new Date(cdEnd).toISOString() : null,
      ends_at: new Date((cdEnd ?? now) + c.solat_minutes * 60_000).toISOString(),
    });
  }
  const { supabaseUrl } = publicEnv();
  return {
    mosque: { id: mosque.id, name: mosque.name, slug: mosque.slug, zone: mosque.zone_code, logo_path: logo?.storage_path ?? null },
    playlist: { version: 0, published_at: new Date().toISOString(), items: slides },
    prayer_mode: config,
    display: ds ?? {},
    overrides,
    schedules,
    server_time: new Date().toISOString(),
    media_base: `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/`,
  };
}
