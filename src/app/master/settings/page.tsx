import { requireMaster } from "@/lib/auth";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, td, th } from "@/components/ui";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { FITS, FIT_LABELS, TRANSITIONS, TRANSITION_LABELS } from "@/lib/constants";
import { PRAYER_LABELS } from "@/lib/prayer/types";
import { updateSystemSettingsAction } from "../actions";

export default async function SettingsPage() {
  const { supabase } = await requireMaster();
  const { data: s } = await supabase.from("system_settings").select("*").eq("id", 1).single();
  const pm = (s?.default_prayer_mode ?? {}) as Record<string, { enabled: boolean; countdown_minutes: number; solat_minutes: number }>;
  return (
    <>
      <PageHeader title="Tetapan sistem" description="Nilai lalai untuk masjid baharu dan had muat naik." />
      <ActionForm action={updateSystemSettingsAction} className="space-y-6">
        <Card>
          <CardTitle>Storan & muat naik</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kuota lalai setiap masjid (MB)" htmlFor="default_quota_mb"><Input id="default_quota_mb" name="default_quota_mb" type="number" min={1} max={10240} defaultValue={Math.round(Number(s?.default_storage_quota_bytes) / 1048576)} /></Field>
            <Field label="Saiz maksimum video (MB)" htmlFor="max_video_mb" hint="Saiz gambar maksimum ditetapkan pada 2 MB."><Input id="max_video_mb" name="max_video_mb" type="number" min={1} max={500} defaultValue={Math.round(Number(s?.max_video_bytes) / 1048576)} /></Field>
          </div>
        </Card>
        <Card>
          <CardTitle>Slaid lalai</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tempoh paparan (saat)" htmlFor="dur"><Input id="dur" name="default_slide_duration_seconds" type="number" min={3} max={3600} defaultValue={s?.default_slide_duration_seconds} /></Field>
            <Field label="Efek pertukaran" htmlFor="tr"><Select id="tr" name="default_transition" defaultValue={s?.default_transition}>{TRANSITIONS.map((t) => <option key={t} value={t}>{TRANSITION_LABELS[t]}</option>)}</Select></Field>
            <Field label="Tempoh pertukaran (ms)" htmlFor="trms"><Input id="trms" name="default_transition_ms" type="number" min={0} max={3000} step={100} defaultValue={s?.default_transition_ms} /></Field>
            <Field label="Muat gambar" htmlFor="fit"><Select id="fit" name="default_fit" defaultValue={s?.default_fit}>{FITS.map((f) => <option key={f} value={f}>{FIT_LABELS[f]}</option>)}</Select></Field>
          </div>
        </Card>
        <Card>
          <CardTitle>Mod Solat lalai</CardTitle>
          <Table>
            <thead><tr><th className={th}>Solat</th><th className={th}>Aktif</th><th className={th}>Countdown (minit)</th><th className={th}>Mod Solat (minit)</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {(["subuh", "zohor", "asar", "maghrib", "isyak", "jumaat"] as const).map((p) => (
                <tr key={p}>
                  <td className={`${td} font-medium`}>{PRAYER_LABELS[p]}</td>
                  <td className={td}><input type="checkbox" name={`${p}_enabled`} defaultChecked={pm[p]?.enabled ?? p !== "jumaat"} aria-label={`${PRAYER_LABELS[p]} aktif`} /></td>
                  <td className={td}><Input name={`${p}_countdown`} type="number" min={1} max={120} defaultValue={pm[p]?.countdown_minutes ?? 10} className="w-24" aria-label="Countdown" /></td>
                  <td className={td}><Input name={`${p}_solat`} type="number" min={1} max={120} defaultValue={pm[p]?.solat_minutes ?? 5} className="w-24" aria-label="Mod Solat" /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <SubmitButton>Simpan tetapan sistem</SubmitButton>
      </ActionForm>
    </>
  );
}
