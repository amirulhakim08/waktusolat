import "server-only";
import { createAdminClient } from "../supabase/admin";
import { addDays, klDateString } from "../time";
import { fetchZoneSchedule, ZONE_RE } from "./esolat";

const COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Makes sure official schedules for today..today+daysAhead exist for a zone,
 * fetching from JAKIM e-Solat when missing. Rate-limited per zone so many
 * displays cannot hammer the upstream service.
 */
export async function ensureZoneSchedules(zone: string, opts: { daysAhead?: number; force?: boolean } = {}) {
  if (!ZONE_RE.test(zone)) return { ok: false as const, error: "invalid_zone" };
  const db = createAdminClient();
  const today = klDateString(Date.now());
  const until = addDays(today, opts.daysAhead ?? 7);

  const { count } = await db
    .from("prayer_schedules")
    .select("id", { count: "exact", head: true })
    .eq("zone_code", zone)
    .gte("date", today)
    .lte("date", until);
  const needed = (opts.daysAhead ?? 7) + 1;
  if (!opts.force && (count ?? 0) >= needed) return { ok: true as const, fetched: false };

  const { data: log } = await db.from("prayer_fetch_log").select("*").eq("zone_code", zone).maybeSingle();
  if (!opts.force && log?.last_attempt_at && Date.now() - Date.parse(log.last_attempt_at) < COOLDOWN_MS) {
    return { ok: false as const, error: "cooldown" };
  }
  await db.from("prayer_fetch_log").upsert({ zone_code: zone, last_attempt_at: new Date().toISOString() });

  try {
    const { result, url } = await fetchZoneSchedule(zone, today, addDays(today, 35));
    if (result.days.length === 0) throw new Error("Tiada data sah daripada e-Solat");
    const now = new Date().toISOString();
    const rows = result.days.map((d) => ({
      zone_code: zone,
      date: d.date,
      hijri_date: d.hijri,
      imsak: d.imsak,
      subuh: d.subuh,
      syuruk: d.syuruk,
      zohor: d.zohor,
      asar: d.asar,
      maghrib: d.maghrib,
      isyak: d.isyak,
      source: "jakim-esolat",
      source_url: url,
      fetched_at: now,
      validated_at: now,
    }));
    const { error } = await db.from("prayer_schedules").upsert(rows, { onConflict: "zone_code,date" });
    if (error) throw error;
    await db.from("prayer_fetch_log").upsert({ zone_code: zone, last_attempt_at: now, last_success_at: now, last_error: null });
    return { ok: true as const, fetched: true, days: rows.length, rejected: result.rejected };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("prayer_fetch_log").upsert({ zone_code: zone, last_attempt_at: new Date().toISOString(), last_error: message.slice(0, 500) });
    console.error(`[prayer-sync] ${zone}:`, message);
    return { ok: false as const, error: message };
  }
}
