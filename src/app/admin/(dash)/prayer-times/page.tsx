import Link from "next/link";
import { requireMosqueAdmin } from "@/lib/auth";
import { Alert, Badge, Card, CardTitle, Field, Input, PageHeader, Table, Textarea, buttonClass, td, th } from "@/components/ui";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { loadManualSchedules, loadSchedules } from "@/lib/preview";
import { addDays, formatHijri, formatMalayDate, klDateString, malayDayName, nowMs } from "@/lib/time";
import { formatDateTime } from "@/lib/format";
import { PRAYER_KEYS, PRAYER_LABELS, type DaySchedule } from "@/lib/prayer/types";
import { deleteManualDateAction, importManualCsvAction, saveManualRangeAction, setPrayerSourceAction } from "@/app/admin/actions";

export default async function PrayerTimesPage() {
  const { supabase, mosque } = await requireMosqueAdmin();
  const today = klDateString(nowMs());
  const manual = mosque.prayer_time_source === "manual";
  const [zoneDays, manualDays, { data: zone }, { data: log }] = await Promise.all([
    loadSchedules(supabase, mosque.zone_code, today, addDays(today, 13)),
    loadManualSchedules(supabase, mosque.id, mosque.zone_code, today, addDays(today, 59)),
    supabase.from("prayer_zones").select("name, state").eq("code", mosque.zone_code).maybeSingle(),
    supabase.from("prayer_fetch_log").select("*").eq("zone_code", mosque.zone_code).maybeSingle(),
  ]);
  const shown = manual ? manualDays : zoneDays;
  const hasToday = shown.some((s) => s.date === today);
  // Prefill: latest manual entry, else today's JAKIM times for the zone.
  const prefill = manualDays.at(-1) ?? zoneDays.find((d) => d.date === today) ?? null;
  const lastManual = manualDays.at(-1)?.date;
  const missingSoon = manual ? Array.from({ length: 7 }, (_, i) => addDays(today, i)).filter((d) => !manualDays.some((m) => m.date === d)) : [];

  return (
    <>
      <PageHeader
        title="Waktu solat"
        description={manual
          ? "Sumber: waktu manual yang dimasukkan oleh pentadbir masjid."
          : `Sumber: JAKIM e-Solat, zon ${mosque.zone_code} — ${zone?.name ?? ""} (${zone?.state ?? ""}).`}
        actions={<Link href="/admin/profile" className={buttonClass("secondary")}>Tukar zon</Link>}
      />

      <Card className="mb-6">
        <CardTitle>Sumber waktu solat</CardTitle>
        <ActionForm action={setPrayerSourceAction} className="space-y-3">
          <label className="flex items-start gap-3 rounded-xl p-3 ring-1 ring-black/10 has-[:checked]:ring-2 has-[:checked]:ring-brand-600">
            <input type="radio" name="source" value="jakim" defaultChecked={!manual} className="mt-1" />
            <span><b>JAKIM e-Solat (disyorkan)</b><br /><span className="text-sm text-black/60">Waktu rasmi mengikut zon {mosque.zone_code}, dikemas kini secara automatik.</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-xl p-3 ring-1 ring-black/10 has-[:checked]:ring-2 has-[:checked]:ring-brand-600">
            <input type="radio" name="source" value="manual" defaultChecked={manual} className="mt-1" />
            <span><b>Manual</b><br /><span className="text-sm text-black/60">Untuk lokasi yang tidak diliputi zon JAKIM, contohnya pelantar luar pesisir. Anda perlu memasukkan waktu bagi setiap tarikh. Paparan TV akan menandakan waktu ini sebagai “waktu ditetapkan oleh masjid”.</span></span>
          </label>
          <SubmitButton variant="secondary">Simpan sumber</SubmitButton>
        </ActionForm>
      </Card>

      <div className="mb-4">
        {hasToday
          ? <Alert tone="success" title={manual ? "Waktu manual hari ini tersedia" : "Data rasmi disahkan"}>
              {manual ? `Waktu dimasukkan sehingga ${lastManual ? formatMalayDate(lastManual) : "—"}.` : `Waktu solat hari ini tersedia. Kemas kini terakhir: ${formatDateTime(log?.last_success_at ?? zoneDays[0]?.fetched_at)}.`}
            </Alert>
          : manual
            ? <Alert tone="error" title="Waktu solat hari ini belum dimasukkan">Paparan TV akan memaparkan amaran dan Mod Solat automatik tidak dimulakan sehingga waktu hari ini dimasukkan.</Alert>
            : <Alert tone="error" title="Data waktu solat tidak dapat disahkan">Sistem tidak dapat mendapatkan data rasmi untuk hari ini{log?.last_error ? ` (${log.last_error})` : ""}. Paparan TV akan memaparkan amaran dan Mod Solat automatik tidak dimulakan. Sistem akan mencuba semula secara automatik.</Alert>}
        {manual && hasToday && missingSoon.length > 0 && (
          <div className="mt-3"><Alert tone="warning" title="Ada tarikh belum diisi dalam 7 hari akan datang">{missingSoon.map(formatMalayDate).join(", ")}</Alert></div>
        )}
      </div>

      {manual && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle>Masukkan waktu untuk julat tarikh</CardTitle>
            <p className="mb-4 text-sm text-black/60">Waktu yang sama akan disimpan untuk setiap tarikh dalam julat. Tarikh yang sudah ada akan dikemas kini.</p>
            <ActionForm action={saveManualRangeAction} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dari tarikh" htmlFor="from"><Input id="from" name="from" type="date" required defaultValue={today} /></Field>
                <Field label="Hingga tarikh" htmlFor="to"><Input id="to" name="to" type="date" required defaultValue={addDays(today, 6)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PRAYER_KEYS.map((k) => (
                  <Field key={k} label={PRAYER_LABELS[k]} htmlFor={`t-${k}`}>
                    <Input id={`t-${k}`} name={k} type="time" required defaultValue={prefill?.[k] ?? ""} />
                  </Field>
                ))}
              </div>
              {prefill && <p className="text-xs text-black/50">Nilai awal diambil daripada {manualDays.length ? `waktu manual terakhir (${formatMalayDate(prefill.date)})` : `JAKIM zon ${mosque.zone_code} hari ini`}. Ubah mengikut lokasi anda.</p>}
              <SubmitButton>Simpan waktu</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardTitle>Tampal jadual (Excel / CSV)</CardTitle>
            <p className="mb-3 text-sm text-black/60">Salin daripada Excel atau Google Sheets dan tampal di sini. Satu baris setiap tarikh, 7 lajur:</p>
            <pre className="mb-3 overflow-x-auto rounded-lg bg-black/[.04] p-3 text-xs">Tarikh,Subuh,Syuruk,Zohor,Asar,Maghrib,Isyak{"\n"}17/11/2026,5:40,6:55,12:55,16:15,19:05,20:15</pre>
            <ActionForm action={importManualCsvAction} className="space-y-3" resetOnSuccess>
              <Textarea name="csv" rows={8} required placeholder="Tampal jadual di sini…" aria-label="Jadual waktu solat" className="font-mono text-xs" />
              <SubmitButton variant="secondary">Import jadual</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">{manual ? "Waktu manual (60 hari akan datang)" : "Waktu rasmi JAKIM (14 hari akan datang)"}</h2>
      <ScheduleTable days={shown} today={today} manual={manual} />
    </>
  );
}

function ScheduleTable({ days, today, manual }: { days: DaySchedule[]; today: string; manual: boolean }) {
  return (
    <Table>
      <thead><tr><th className={th}>Tarikh</th>{PRAYER_KEYS.map((p) => <th key={p} className={th}>{PRAYER_LABELS[p]}</th>)}{manual && <th className={th} />}</tr></thead>
      <tbody className="divide-y divide-black/5">
        {days.map((s) => (
          <tr key={s.date} className={s.date === today ? "bg-gold-100/60" : undefined}>
            <td className={td}>
              <p className="font-medium whitespace-nowrap">{malayDayName(s.date)}, {formatMalayDate(s.date)} {s.date === today && <Badge tone="gold">Hari ini</Badge>}</p>
              <p className="text-xs text-black/55">{formatHijri(s.hijri)}</p>
            </td>
            {PRAYER_KEYS.map((p) => <td key={p} className={`${td} tabular-nums`}>{s[p]}</td>)}
            {manual && (
              <td className={td}>
                <ActionForm action={deleteManualDateAction} confirm={`Padam waktu ${s.date}?`}>
                  <input type="hidden" name="date" value={s.date} />
                  <SubmitButton variant="ghost" pendingText="…">Padam</SubmitButton>
                </ActionForm>
              </td>
            )}
          </tr>
        ))}
        {days.length === 0 && <tr><td className={td} colSpan={manual ? 8 : 7}>{manual ? "Belum ada waktu manual dimasukkan." : "Tiada data tersimpan untuk zon ini."}</td></tr>}
      </tbody>
    </Table>
  );
}
