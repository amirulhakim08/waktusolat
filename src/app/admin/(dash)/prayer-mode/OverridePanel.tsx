"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardTitle, Input, Select } from "@/components/ui";
import { PRAYER_LABELS, type PrayerModeKey } from "@/lib/prayer/types";
import { clearOverrideAction, overrideAction } from "@/app/admin/actions";

export interface ActiveOverride { kind: "countdown" | "solat" | "normal"; prayer: PrayerModeKey | null; ends_at: string; countdown_ends_at: string | null }

const KIND = { countdown: "Countdown manual", solat: "Mod Solat manual", normal: "Mod Solat ditamatkan secara manual" };

/** Manual control for when the imam starts earlier or later (spec §15). */
export function OverridePanel({ active, suggestedPrayer }: { active: ActiveOverride | null; suggestedPrayer: PrayerModeKey }) {
  const router = useRouter();
  const [prayer, setPrayer] = useState<PrayerModeKey>(active?.prayer ?? suggestedPrayer);
  const [countdown, setCountdown] = useState(5);
  const [solat, setSolat] = useState(5);
  const [normal, setNormal] = useState(30);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      setResult(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.error ?? "Ralat" });
      router.refresh();
    });
  };
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" });

  return (
    <Card>
      <CardTitle>Kawalan manual (semua paparan)</CardTitle>
      {active ? (
        <div className="mb-4"><Alert tone="warning" title={KIND[active.kind]}>
          {active.prayer ? `${PRAYER_LABELS[active.prayer]} · ` : ""}
          {active.countdown_ends_at ? `solat bermula ${fmt(active.countdown_ends_at)} · ` : ""}tamat {fmt(active.ends_at)}, kemudian kembali ke jadual automatik.
        </Alert></div>
      ) : <p className="mb-4 text-sm text-black/60">Tiada kawalan manual aktif. Paparan mengikut jadual automatik.</p>}
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">Solat
          <Select value={prayer} onChange={(e) => setPrayer(e.target.value as PrayerModeKey)}>
            {(["subuh", "zohor", "asar", "maghrib", "isyak", "jumaat"] as const).map((p) => <option key={p} value={p}>{PRAYER_LABELS[p]}</option>)}
          </Select>
        </label>
        <label className="text-sm">Countdown (minit)<Input type="number" min={1} max={120} value={countdown} onChange={(e) => setCountdown(Number(e.target.value))} /></label>
        <label className="text-sm">Mod Solat (minit)<Input type="number" min={1} max={60} value={solat} onChange={(e) => setSolat(Number(e.target.value))} /></label>
        <label className="text-sm">Tamatkan selama (minit)<Input type="number" min={1} max={180} value={normal} onChange={(e) => setNormal(Number(e.target.value))} /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => run(() => overrideAction({ kind: "countdown", prayer, countdown_minutes: countdown, solat_minutes: solat, normal_minutes: null }), `Mulakan countdown ${countdown} minit sekarang di semua TV?`)}>Mulakan Countdown Sekarang</Button>
        <Button variant="gold" disabled={pending} onClick={() => run(() => overrideAction({ kind: "solat", prayer, countdown_minutes: null, solat_minutes: solat, normal_minutes: null }), `Mulakan Mod Solat ${solat} minit sekarang?`)}>Mulakan Mod Solat Sekarang</Button>
        <Button variant="danger" disabled={pending} onClick={() => run(() => overrideAction({ kind: "normal", prayer: null, countdown_minutes: null, solat_minutes: null, normal_minutes: normal }), "Tamatkan Mod Solat dan kembali ke slaid?")}>Tamatkan Mod Solat</Button>
        <Button variant="secondary" disabled={pending || !active} onClick={() => run(clearOverrideAction, "Kembali ke jadual automatik?")}>Kembali ke Jadual Automatik</Button>
      </div>
      {result && <div className="mt-3"><Alert tone={result.ok ? "success" : "error"}>{result.text}</Alert></div>}
      <p className="mt-3 text-xs text-black/50">Semua kawalan manual direkodkan dalam log audit dan tamat secara automatik (maksimum 3 jam). Waktu solat yang telah dikawal secara manual tidak akan dimulakan semula secara automatik.</p>
    </Card>
  );
}
