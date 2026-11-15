import { requireMosqueAdmin } from "@/lib/auth";
import { nowMs } from "@/lib/time";
import { Alert, PageHeader } from "@/components/ui";
import { DisplaySessionsTable, type SessionRow } from "@/components/DisplaySessionsTable";

export default async function DisplaysPage() {
  const { supabase, mosqueId, mosque } = await requireMosqueAdmin();
  const { data } = await supabase.from("display_sessions").select("*").eq("mosque_id", mosqueId).order("last_heartbeat_at", { ascending: false }).limit(100);
  const now = nowMs();
  return (
    <>
      <PageHeader title="Pemantauan paparan" description={`Pelayar yang membuka /${mosque.slug}.`} />
      <div className="mb-4"><Alert tone="info">Heartbeat menunjukkan sesi pelayar yang aktif, bukan status kuasa TV fizikal.</Alert></div>
      <DisplaySessionsTable rows={(data ?? []) as SessionRow[]} now={now} />
    </>
  );
}
