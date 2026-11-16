import { requireMosqueAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { currentPrayer } from "@/lib/prayer/engine";
import { loadMosqueSchedules } from "@/lib/preview";
import { klDateString, nowMs } from "@/lib/time";
import type { PrayerModeKey } from "@/lib/prayer/types";
import { PrayerModeEditor, type ModeRow } from "./PrayerModeEditor";
import { OverridePanel, type ActiveOverride } from "./OverridePanel";

const ORDER = ["subuh", "zohor", "asar", "maghrib", "isyak", "jumaat"];

export default async function PrayerModePage() {
  const { supabase, mosqueId, mosque } = await requireMosqueAdmin();
  const now = nowMs();
  const nowIso = new Date(now).toISOString();
  const today = klDateString(now);
  const [{ data: rows }, { data: pub }, { data: ovs }, schedules] = await Promise.all([
    supabase.from("prayer_mode_settings").select("prayer, enabled, countdown_minutes, solat_minutes, countdown_message, solat_message, replaces_zohor").eq("mosque_id", mosqueId),
    supabase.from("mosque_publications").select("prayer_mode_published_at").eq("mosque_id", mosqueId).maybeSingle(),
    supabase.from("prayer_mode_overrides").select("kind, prayer, ends_at, countdown_ends_at").eq("mosque_id", mosqueId).is("cancelled_at", null).lte("starts_at", nowIso).gt("ends_at", nowIso).order("starts_at", { ascending: false }).limit(1),
    loadMosqueSchedules(supabase, mosque, today, today),
  ]);
  const sorted = ((rows ?? []) as ModeRow[]).sort((a, b) => ORDER.indexOf(a.prayer) - ORDER.indexOf(b.prayer));
  const cur = currentPrayer(now, schedules);
  const suggested = (cur && cur !== "syuruk" ? cur : "maghrib") as PrayerModeKey;
  return (
    <>
      <PageHeader title="Mod Solat" description="Tetapkan countdown sebelum solat berjemaah dan tempoh Mod Solat bagi setiap waktu." />
      <div className="space-y-6">
        <OverridePanel active={(ovs?.[0] as ActiveOverride) ?? null} suggestedPrayer={suggested} />
        <PrayerModeEditor initial={sorted} publishedAt={formatDateTime(pub?.prayer_mode_published_at)} />
      </div>
    </>
  );
}
