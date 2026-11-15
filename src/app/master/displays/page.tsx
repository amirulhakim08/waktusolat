import { requireMaster } from "@/lib/auth";
import { nowMs } from "@/lib/time";
import { Alert, PageHeader } from "@/components/ui";
import { DisplaySessionsTable, type SessionRow } from "@/components/DisplaySessionsTable";

export default async function DisplaysPage() {
  const { supabase } = await requireMaster();
  const since = new Date(nowMs() - 7 * 86400_000).toISOString();
  const { data } = await supabase.from("display_sessions").select("*, mosque:mosques(name, slug)")
    .gte("last_heartbeat_at", since).order("last_heartbeat_at", { ascending: false }).limit(500);
  const now = nowMs();
  return (
    <>
      <PageHeader title="Pemantauan paparan" description="Sesi pelayar yang memaparkan masjid dalam 7 hari terakhir." />
      <div className="mb-4"><Alert tone="info">Heartbeat menunjukkan sesi pelayar yang aktif — bukan jaminan bahawa TV fizikal sedang dihidupkan.</Alert></div>
      <DisplaySessionsTable rows={(data ?? []) as SessionRow[]} showMosque now={now} />
    </>
  );
}
