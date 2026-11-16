import Link from "next/link";
import { requireMosqueAdmin } from "@/lib/auth";
import { Alert, Badge, PageHeader, Table, buttonClass, td, th } from "@/components/ui";
import { loadSchedules } from "@/lib/preview";
import { addDays, formatHijri, formatMalayDate, klDateString, malayDayName, nowMs } from "@/lib/time";
import { formatDateTime } from "@/lib/format";
import { PRAYER_KEYS, PRAYER_LABELS } from "@/lib/prayer/types";

export default async function PrayerTimesPage() {
  const { supabase, mosque } = await requireMosqueAdmin();
  const today = klDateString(nowMs());
  const [schedules, { data: zone }, { data: log }] = await Promise.all([
    loadSchedules(supabase, mosque.zone_code, today, addDays(today, 13)),
    supabase.from("prayer_zones").select("name, state").eq("code", mosque.zone_code).maybeSingle(),
    supabase.from("prayer_fetch_log").select("*").eq("zone_code", mosque.zone_code).maybeSingle(),
  ]);
  const hasToday = schedules.some((s) => s.date === today);
  return (
    <>
      <PageHeader title="Waktu solat" description={`Zon ${mosque.zone_code} — ${zone?.name ?? ""} (${zone?.state ?? ""}). Sumber: JAKIM e-Solat.`}
        actions={<Link href="/admin/profile" className={buttonClass("secondary")}>Tukar zon</Link>} />
      <div className="mb-4">
        {hasToday
          ? <Alert tone="success" title="Data rasmi disahkan">Waktu solat hari ini tersedia. Kemas kini terakhir: {formatDateTime(log?.last_success_at ?? schedules[0]?.fetched_at)}.</Alert>
          : <Alert tone="error" title="Data waktu solat tidak dapat disahkan">Sistem tidak dapat mendapatkan data rasmi untuk hari ini{log?.last_error ? ` (${log.last_error})` : ""}. Paparan TV akan memaparkan amaran dan Mod Solat automatik tidak dimulakan. Sistem akan mencuba semula secara automatik.</Alert>}
      </div>
      <Table>
        <thead><tr><th className={th}>Tarikh</th>{PRAYER_KEYS.map((p) => <th key={p} className={th}>{PRAYER_LABELS[p]}</th>)}</tr></thead>
        <tbody className="divide-y divide-black/5">
          {schedules.map((s) => (
            <tr key={s.date} className={s.date === today ? "bg-gold-100/60" : undefined}>
              <td className={td}>
                <p className="font-medium">{malayDayName(s.date)}, {formatMalayDate(s.date)} {s.date === today && <Badge tone="gold">Hari ini</Badge>}</p>
                <p className="text-xs text-black/55">{formatHijri(s.hijri)}</p>
              </td>
              {PRAYER_KEYS.map((p) => <td key={p} className={`${td} tabular-nums`}>{s[p]}</td>)}
            </tr>
          ))}
          {schedules.length === 0 && <tr><td className={td} colSpan={7}>Tiada data tersimpan untuk zon ini.</td></tr>}
        </tbody>
      </Table>
    </>
  );
}
