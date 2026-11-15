import Link from "next/link";
import { requireMosqueAdmin } from "@/lib/auth";
import { Card, CardTitle, Field, Input, PageHeader, buttonClass } from "@/components/ui";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ZonePicker } from "@/components/forms/ZonePicker";
import { listZones } from "@/lib/zones";
import { mediaUrl } from "@/lib/slideshow";
import { publicEnv } from "@/lib/env";
import { setLogoAction, updateMosqueProfileAction } from "@/app/admin/actions";

export default async function ProfilePage() {
  const { supabase, mosque } = await requireMosqueAdmin();
  const [zones, { data: logo }] = await Promise.all([
    listZones(),
    mosque.logo_asset_id ? supabase.from("media_assets").select("storage_path").eq("id", mosque.logo_asset_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return (
    <>
      <PageHeader title="Profil masjid" description="Maklumat yang dipaparkan di skrin TV dan zon waktu solat." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <ActionForm action={updateMosqueProfileAction} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Nama masjid / surau" htmlFor="name"><Input id="name" name="name" defaultValue={mosque.name} required maxLength={150} /></Field></div>
            <div className="sm:col-span-2"><Field label="Alamat" htmlFor="address"><Input id="address" name="address" defaultValue={mosque.address} maxLength={500} /></Field></div>
            <Field label="Daerah" htmlFor="district"><Input id="district" name="district" defaultValue={mosque.district} maxLength={80} /></Field>
            <div className="hidden sm:block" />
            <ZonePicker zones={zones} defaultState={mosque.state} defaultZone={mosque.zone_code} />
            <div className="sm:col-span-2">
              <Field label="Pautan paparan awam" htmlFor="slug" hint={`${publicEnv().siteUrl}/${mosque.slug} — jika ditukar, pautan lama akan dialihkan secara automatik.`}>
                <Input id="slug" name="slug" defaultValue={mosque.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={60} />
              </Field>
            </div>
            <div className="sm:col-span-2"><SubmitButton>Simpan profil</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card>
          <CardTitle>Logo</CardTitle>
          <div className="flex aspect-square items-center justify-center rounded-xl bg-brand-950">
            {logo?.storage_path
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={mediaUrl(logo.storage_path)} alt="Logo masjid" className="h-3/4 w-3/4 object-contain" />
              : <p className="text-sm text-white/50">Tiada logo</p>}
          </div>
          <p className="mt-3 text-sm text-black/60">Muat naik logo di Pustaka Media, kemudian pilih “Jadikan logo”.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/admin/media" className={buttonClass("secondary", "sm")}>Pustaka media</Link>
            {logo && <ActionForm action={setLogoAction}><input type="hidden" name="logo_asset_id" value="" /><SubmitButton variant="ghost">Buang logo</SubmitButton></ActionForm>}
          </div>
        </Card>
      </div>
    </>
  );
}
