import Link from "next/link";
import { requireMaster } from "@/lib/auth";
import { Input, PageHeader, ProgressBar, Table, td, th } from "@/components/ui";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { formatBytes } from "@/lib/format";
import { setQuotaAction } from "../actions";

type Row = { mosque_id: string; mosque_name: string; slug: string; quota_bytes: number; used_bytes: number; image_count: number; video_count: number; image_bytes: number; video_bytes: number };

export default async function StoragePage() {
  const { supabase } = await requireMaster();
  const { data } = await supabase.rpc("get_storage_summary");
  const rows = ((data ?? []) as Row[]).sort((a, b) => Number(b.used_bytes) / Number(b.quota_bytes) - Number(a.used_bytes) / Number(a.quota_bytes));
  return (
    <>
      <PageHeader title="Pemantauan storan" description="Penggunaan media setiap masjid (dokumen pendaftaran tidak dikira dalam kuota)." />
      <Table>
        <thead><tr><th className={th}>Masjid</th><th className={th}>Digunakan</th><th className={th}>Baki</th><th className={th}>Gambar</th><th className={th}>Video</th><th className={th}>Kuota (MB)</th></tr></thead>
        <tbody className="divide-y divide-black/5">
          {rows.map((r) => (
            <tr key={r.mosque_id}>
              <td className={td}><Link href={`/master/mosques/${r.mosque_id}`} className="font-medium hover:underline">{r.mosque_name}</Link></td>
              <td className={`${td} w-56`}><p className="mb-1 text-xs">{formatBytes(r.used_bytes)} / {formatBytes(r.quota_bytes)}</p><ProgressBar value={Number(r.used_bytes)} max={Number(r.quota_bytes)} /></td>
              <td className={td}>{formatBytes(Math.max(0, Number(r.quota_bytes) - Number(r.used_bytes)))}</td>
              <td className={td}>{r.image_count} ({formatBytes(r.image_bytes)})</td>
              <td className={td}>{r.video_count} ({formatBytes(r.video_bytes)})</td>
              <td className={td}>
                <ActionForm action={setQuotaAction} className="flex gap-2">
                  <input type="hidden" name="mosque_id" value={r.mosque_id} />
                  <Input name="quota_mb" type="number" min={1} max={10240} defaultValue={Math.round(Number(r.quota_bytes) / 1048576)} className="w-24" aria-label="Kuota MB" />
                  <SubmitButton variant="secondary">Simpan</SubmitButton>
                </ActionForm>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className={td} colSpan={6}>Tiada masjid.</td></tr>}
        </tbody>
      </Table>
    </>
  );
}
