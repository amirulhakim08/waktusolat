"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardTitle, Input, Select, buttonClass } from "@/components/ui";
import { COUNTDOWN_OPTIONS, SOLAT_OPTIONS } from "@/lib/constants";
import { PRAYER_LABELS, type PrayerModeKey } from "@/lib/prayer/types";
import { savePrayerModeAction } from "@/app/admin/actions";

export interface ModeRow {
  prayer: PrayerModeKey;
  enabled: boolean;
  countdown_minutes: number;
  solat_minutes: number;
  countdown_message: string;
  solat_message: string;
  replaces_zohor: boolean;
}

function MinutesPicker({ id, value, options, onChange, label }: { id: string; value: number; options: readonly number[]; onChange: (v: number) => void; label: string }) {
  const custom = !options.includes(value);
  const [showCustom, setShowCustom] = useState(custom);
  return (
    <div className="flex items-center gap-2">
      <Select id={id} aria-label={label} value={showCustom ? "custom" : value} className="w-32"
        onChange={(e) => { if (e.target.value === "custom") setShowCustom(true); else { setShowCustom(false); onChange(Number(e.target.value)); } }}>
        {options.map((o) => <option key={o} value={o}>{o} minit</option>)}
        <option value="custom">Lain-lain…</option>
      </Select>
      {showCustom && <Input type="number" min={1} max={120} value={value} aria-label={`${label} (minit)`} className="w-20"
        onChange={(e) => onChange(Math.max(1, Math.min(120, Number(e.target.value) || 1)))} />}
    </div>
  );
}

export function PrayerModeEditor({ initial, publishedAt }: { initial: ModeRow[]; publishedAt: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: PrayerModeKey, patch: Partial<ModeRow>) => {
    setRows((r) => r.map((x) => (x.prayer === p ? { ...x, ...patch } : x)));
    setDirty(true);
    setResult(null);
  };
  const submit = (publish: boolean) => start(async () => {
    const r = await savePrayerModeAction(rows, publish);
    setResult(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.error });
    if (r.ok) { setDirty(false); router.refresh(); }
  });

  const daily = rows.filter((r) => r.prayer !== "jumaat");
  const jumaat = rows.find((r) => r.prayer === "jumaat")!;
  return (
    <Card>
      <CardTitle action={<span className="text-xs text-black/50">Diterbitkan: {publishedAt}</span>}>Countdown Sebelum Solat & Mod Solat</CardTitle>
      <p className="mb-4 text-sm text-black/60">
        Countdown bermula tepat pada waktu solat rasmi. Selepas countdown tamat, skrin bertukar ke Mod Solat (tenang, tanpa slaid) untuk tempoh yang ditetapkan, kemudian kembali ke paparan biasa. Syuruk tidak mencetuskan Mod Solat.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-black/50">
            <th className="py-2 pr-3">Solat</th><th className="py-2 pr-3">Aktif</th><th className="py-2 pr-3">Countdown</th><th className="py-2 pr-3">Tempoh Mod Solat</th><th className="py-2 pr-3">Mesej countdown</th><th className="py-2">Mesej Mod Solat</th>
          </tr></thead>
          <tbody className="divide-y divide-black/5">
            {daily.map((r) => (
              <tr key={r.prayer} data-prayer={r.prayer}>
                <td className="py-3 pr-3 font-semibold">{PRAYER_LABELS[r.prayer]}</td>
                <td className="py-3 pr-3"><input type="checkbox" checked={r.enabled} onChange={(e) => set(r.prayer, { enabled: e.target.checked })} aria-label={`Aktifkan Mod Solat ${PRAYER_LABELS[r.prayer]}`} /></td>
                <td className="py-3 pr-3"><MinutesPicker id={`${r.prayer}-cd`} label="Countdown" value={r.countdown_minutes} options={COUNTDOWN_OPTIONS} onChange={(v) => set(r.prayer, { countdown_minutes: v })} /></td>
                <td className="py-3 pr-3"><MinutesPicker id={`${r.prayer}-so`} label="Mod Solat" value={r.solat_minutes} options={SOLAT_OPTIONS} onChange={(v) => set(r.prayer, { solat_minutes: v })} /></td>
                <td className="py-3 pr-3"><Input value={r.countdown_message} maxLength={160} placeholder="(lalai)" aria-label="Mesej countdown" onChange={(e) => set(r.prayer, { countdown_message: e.target.value })} /></td>
                <td className="py-3"><Input value={r.solat_message} maxLength={160} placeholder="(lalai)" aria-label="Mesej Mod Solat" onChange={(e) => set(r.prayer, { solat_message: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl bg-gold-100/60 p-4">
        <p className="font-semibold">Solat Jumaat</p>
        <p className="mt-1 text-sm text-black/60">Countdown Jumaat bermula pada waktu Zohor rasmi hari Jumaat. Tetapkan tempoh mengikut amalan masjid anda (cth. termasuk khutbah).</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={jumaat.enabled} onChange={(e) => set("jumaat", { enabled: e.target.checked })} /> Guna tetapan khas Jumaat</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={jumaat.replaces_zohor} disabled={!jumaat.enabled} onChange={(e) => set("jumaat", { replaces_zohor: e.target.checked })} /> Gantikan tempoh Zohor biasa</label>
          <div><p className="mb-1 text-xs text-black/55">Countdown Jumaat</p><MinutesPicker id="jumaat-cd" label="Countdown Jumaat" value={jumaat.countdown_minutes} options={COUNTDOWN_OPTIONS} onChange={(v) => set("jumaat", { countdown_minutes: v })} /></div>
          <div><p className="mb-1 text-xs text-black/55">Mod Solat Jumaat</p><MinutesPicker id="jumaat-so" label="Mod Solat Jumaat" value={jumaat.solat_minutes} options={SOLAT_OPTIONS} onChange={(v) => set("jumaat", { solat_minutes: v })} /></div>
          <Input className="sm:col-span-2" value={jumaat.countdown_message} maxLength={160} placeholder="Mesej countdown Jumaat" aria-label="Mesej countdown Jumaat" onChange={(e) => set("jumaat", { countdown_message: e.target.value })} />
          <Input className="sm:col-span-2" value={jumaat.solat_message} maxLength={160} placeholder="Mesej Mod Solat Jumaat" aria-label="Mesej Mod Solat Jumaat" onChange={(e) => set("jumaat", { solat_message: e.target.value })} />
        </div>
        <p className="mt-2 text-xs text-black/55">Jika “Gantikan tempoh Zohor biasa” tidak ditanda, tempoh Zohor biasa digunakan tetapi label dan mesej Jumaat dipaparkan.</p>
      </div>

      {dirty && <div className="mt-4"><Alert tone="warning">Perubahan belum disimpan.</Alert></div>}
      {result && <div className="mt-4"><Alert tone={result.ok ? "success" : "error"}>{result.text}</Alert></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => submit(false)}>Simpan Draf</Button>
        <Link href="/admin/preview?simulate=countdown&prayer=maghrib" className={buttonClass("secondary")}>Pratonton</Link>
        <Button variant="gold" disabled={pending} onClick={() => submit(true)}>Terbitkan ke TV</Button>
      </div>
    </Card>
  );
}
