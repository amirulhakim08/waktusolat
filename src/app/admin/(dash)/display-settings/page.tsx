import { requireMosqueAdmin } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { formatDateTime } from "@/lib/format";
import { saveDisplaySettingsAction } from "@/app/admin/actions";

export default async function DisplaySettingsPage() {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const [{ data: s }, { data: pub }] = await Promise.all([
    supabase.from("display_settings").select("*").eq("mosque_id", mosqueId).single(),
    supabase.from("mosque_publications").select("display_published_at").eq("mosque_id", mosqueId).maybeSingle(),
  ]);
  return (
    <>
      <PageHeader title="Tetapan paparan" description={`Tetapan jam, tarikh dan skrin Mod Solat. Diterbitkan: ${formatDateTime(pub?.display_published_at)}`} />
      <Card>
        <ActionForm action={saveDisplaySettingsAction} className="grid gap-5 sm:grid-cols-2">
          <Field label="Format jam" htmlFor="clock_format">
            <Select id="clock_format" name="clock_format" defaultValue={s?.clock_format}><option value="24h">24 jam (19:12)</option><option value="12h">12 jam (7:12 PTG)</option></Select>
          </Field>
          <div className="space-y-2 pt-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="show_seconds" defaultChecked={s?.show_seconds} /> Papar saat pada jam</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="show_hijri" defaultChecked={s?.show_hijri} /> Papar tarikh Hijrah</label>
          </div>
          <Field label="Mesej di bawah countdown" htmlFor="countdown_subtitle"><Input id="countdown_subtitle" name="countdown_subtitle" defaultValue={s?.countdown_subtitle} maxLength={160} /></Field>
          <Field label="Gaya skrin Mod Solat" htmlFor="solat_screen_style" hint="Skrin hitam sepenuhnya tidak memaparkan sebarang teks.">
            <Select id="solat_screen_style" name="solat_screen_style" defaultValue={s?.solat_screen_style}><option value="message">Latar gelap dengan mesej</option><option value="black">Skrin hitam sepenuhnya</option></Select>
          </Field>
          <Field label="Tajuk Mod Solat" htmlFor="solat_title"><Input id="solat_title" name="solat_title" defaultValue={s?.solat_title} maxLength={80} required /></Field>
          <Field label="Mesej Mod Solat" htmlFor="solat_subtitle"><Input id="solat_subtitle" name="solat_subtitle" defaultValue={s?.solat_subtitle} maxLength={160} /></Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <SubmitButton variant="secondary" name="intent" value="draft">Simpan Draf</SubmitButton>
            <SubmitButton variant="gold" name="intent" value="publish">Terbitkan ke TV</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
