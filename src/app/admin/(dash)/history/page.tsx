import { requireMosqueAdmin } from "@/lib/auth";
import { Card, CardTitle, PageHeader, Table, td, th } from "@/components/ui";
import { AuditTable, type AuditRow } from "@/components/AuditTable";
import { formatDateTime } from "@/lib/format";

export default async function HistoryPage() {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const [{ data: versions }, { data: audit }] = await Promise.all([
    supabase.from("playlist_versions").select("id, version, playlist_name, item_count, published_at, profiles(full_name, email)").eq("mosque_id", mosqueId).order("version", { ascending: false }).limit(50),
    supabase.from("audit_logs").select("id, action, created_at, details, target_type, target_id, actor:profiles(email, full_name)").eq("mosque_id", mosqueId).order("created_at", { ascending: false }).limit(100),
  ]);
  type V = { id: string; version: number; playlist_name: string; item_count: number; published_at: string; profiles: { full_name: string; email: string } | null };
  return (
    <>
      <PageHeader title="Sejarah penerbitan" description="Setiap penerbitan playlist disimpan sebagai versi kekal." />
      <Card className="mb-6">
        <CardTitle>Versi playlist</CardTitle>
        <Table>
          <thead><tr><th className={th}>Versi</th><th className={th}>Playlist</th><th className={th}>Item</th><th className={th}>Diterbitkan</th><th className={th}>Oleh</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {((versions ?? []) as unknown as V[]).map((v) => (
              <tr key={v.id}><td className={td}>v{v.version}</td><td className={td}>{v.playlist_name}</td><td className={td}>{v.item_count}</td><td className={td}>{formatDateTime(v.published_at)}</td><td className={td}>{v.profiles?.full_name || v.profiles?.email || "—"}</td></tr>
            ))}
            {(versions ?? []).length === 0 && <tr><td className={td} colSpan={5}>Belum ada penerbitan.</td></tr>}
          </tbody>
        </Table>
      </Card>
      <Card><CardTitle>Aktiviti</CardTitle><AuditTable rows={(audit ?? []) as unknown as AuditRow[]} /></Card>
    </>
  );
}
