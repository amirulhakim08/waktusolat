import { requireMosqueAdmin } from "@/lib/auth";
import { Alert, Card, CardTitle, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { formatBytes } from "@/lib/format";

export default async function StoragePage() {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const { data } = await supabase.rpc("get_storage_summary", { p_mosque_id: mosqueId });
  const s = data?.[0];
  if (!s) return null;
  const used = Number(s.used_bytes), quota = Number(s.quota_bytes);
  const pct = (used / quota) * 100;
  return (
    <>
      <PageHeader title="Penggunaan storan" description="Kuota merangkumi semua gambar dan video (draf dan diterbitkan)." />
      {pct >= 80 && <div className="mb-4"><Alert tone={pct >= 95 ? "error" : "warning"} title={pct >= 100 ? "Storan penuh" : pct >= 95 ? "Storan hampir penuh (95%)" : "Storan melebihi 80%"}>Padam media yang tidak digunakan untuk membebaskan ruang.</Alert></div>}
      <Card>
        <CardTitle>Storan: {formatBytes(used)} / {formatBytes(quota)}</CardTitle>
        <ProgressBar value={used} max={quota} />
        <p className="mt-2 text-sm text-black/60">Baki: {formatBytes(Math.max(0, quota - used))}{Number(s.pending_bytes) > 0 ? ` · ${formatBytes(s.pending_bytes)} sedang dimuat naik` : ""}</p>
      </Card>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bilangan gambar" value={s.image_count} />
        <StatCard label="Storan gambar" value={formatBytes(s.image_bytes)} />
        <StatCard label="Bilangan video" value={s.video_count} />
        <StatCard label="Storan video" value={formatBytes(s.video_bytes)} />
      </div>
    </>
  );
}
