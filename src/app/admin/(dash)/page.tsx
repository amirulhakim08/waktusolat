import Link from "next/link";
import { requireMosqueAdmin } from "@/lib/auth";
import { Alert, Card, CardTitle, PageHeader, ProgressBar, StatCard, buttonClass } from "@/components/ui";
import { formatBytes, formatDateTime } from "@/lib/format";
import { nextPrayer } from "@/lib/prayer/engine";
import { klDateString, addDays, formatHHMM, nowMs } from "@/lib/time";
import { DISPLAY_ONLINE_MS } from "@/lib/constants";
import type { DaySchedule } from "@/lib/prayer/types";

export default async function AdminDashboard() {
  const { supabase, mosque, mosqueId } = await requireMosqueAdmin();
  const now = nowMs();
  const today = klDateString(now);
  const [storage, images, pub, sessions, schedules] = await Promise.all([
    supabase.rpc("get_storage_summary", { p_mosque_id: mosqueId }),
    supabase.from("media_assets").select("id", { count: "exact", head: true }).eq("mosque_id", mosqueId).eq("status", "ready").eq("kind", "image"),
    supabase.from("mosque_publications").select("playlist_versions(version, published_at, playlist_name, item_count)").eq("mosque_id", mosqueId).maybeSingle(),
    supabase.from("display_sessions").select("id", { count: "exact", head: true }).eq("mosque_id", mosqueId).gte("last_heartbeat_at", new Date(now - DISPLAY_ONLINE_MS).toISOString()),
    supabase.from("prayer_schedules").select("date, hijri:hijri_date, subuh, syuruk, zohor, asar, maghrib, isyak").eq("zone_code", mosque.zone_code).gte("date", today).lte("date", addDays(today, 1)),
  ]);
  const s = storage.data?.[0];
  const pv = (pub.data as unknown as { playlist_versions: { version: number; published_at: string; playlist_name: string; item_count: number } | null } | null)?.playlist_versions;
  const days: DaySchedule[] = (schedules.data ?? []).map((d) => ({ ...d, ...Object.fromEntries(["subuh", "syuruk", "zohor", "asar", "maghrib", "isyak"].map((k) => [k, String((d as Record<string, string>)[k]).slice(0, 5)])) } as DaySchedule));
  const next = nextPrayer(now, days);
  const pct = s ? (Number(s.used_bytes) / Number(s.quota_bytes)) * 100 : 0;

  return (
    <>
      <PageHeader title={mosque.name} description={`Zon ${mosque.zone_code} · Paparan awam: /${mosque.slug}`}
        actions={<><a href={`/${mosque.slug}`} target="_blank" className={buttonClass("secondary")}>Buka paparan TV ↗</a><Link href="/admin/media" className={buttonClass()}>Muat naik media</Link></>} />
      {!days.some((d) => d.date === today) && (
        <div className="mb-4"><Alert tone="warning" title="Waktu solat hari ini belum tersedia">Data rasmi e-Solat untuk zon {mosque.zone_code} belum dapat disahkan. Mod Solat automatik tidak akan bermula sehingga data tersedia.</Alert></div>
      )}
      {pct >= 80 && <div className="mb-4"><Alert tone={pct >= 95 ? "error" : "warning"}>Storan media {pct >= 100 ? "penuh" : `${Math.round(pct)}% digunakan`}. Padam media yang tidak diperlukan.</Alert></div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Zon waktu solat" value={mosque.zone_code} />
        <StatCard label="Waktu seterusnya" value={next ? `${next.label} ${formatHHMM(days.find((d) => d.date === next.date)![next.prayer], "24h")}` : "—"} tone="gold" />
        <StatCard label="Jumlah gambar" value={images.count ?? 0} />
        <StatCard label="Paparan dalam talian" value={sessions.count ?? 0} hint={<Link className="underline" href="/admin/displays">Lihat paparan</Link>} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle action={<Link href="/admin/playlist" className={buttonClass("ghost", "sm")}>Urus playlist</Link>}>Playlist aktif di TV</CardTitle>
          {pv ? (
            <p className="text-sm">
              <b>{pv.playlist_name}</b> — versi {pv.version}, {pv.item_count} item<br />
              <span className="text-black/55">Diterbitkan {formatDateTime(pv.published_at)}</span>
            </p>
          ) : <p className="text-sm text-black/60">Belum ada playlist diterbitkan. TV memaparkan nama masjid dan waktu solat sahaja.</p>}
        </Card>
        <Card>
          <CardTitle action={<Link href="/admin/storage" className={buttonClass("ghost", "sm")}>Butiran</Link>}>Storan</CardTitle>
          {s && <>
            <p className="mb-2 text-sm">Storan: <b>{formatBytes(s.used_bytes)}</b> / {formatBytes(s.quota_bytes)}</p>
            <ProgressBar value={Number(s.used_bytes)} max={Number(s.quota_bytes)} />
          </>}
        </Card>
      </div>
    </>
  );
}
