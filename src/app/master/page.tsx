import Link from "next/link";
import { nowMs } from "@/lib/time";
import { requireMaster } from "@/lib/auth";
import { Card, CardTitle, PageHeader, StatCard, buttonClass } from "@/components/ui";
import { AuditTable, type AuditRow } from "@/components/AuditTable";
import { formatBytes, formatDateTime } from "@/lib/format";
import { DISPLAY_ONLINE_MS } from "@/lib/constants";
import { markNotificationsReadAction } from "./actions";

export default async function MasterOverview() {
  const { supabase, user } = await requireMaster();
  const since = new Date(nowMs() - DISPLAY_ONLINE_MS).toISOString();
  const [mosques, pending, admins, sessions, storage, audit, notes] = await Promise.all([
    supabase.from("mosques").select("status"),
    supabase.from("mosque_applications").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    supabase.from("mosque_admin_assignments").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("display_sessions").select("id", { count: "exact", head: true }).gte("last_heartbeat_at", since),
    supabase.rpc("get_storage_summary"),
    supabase.from("audit_logs").select("id, action, created_at, details, target_type, target_id, actor:profiles(email, full_name), mosque:mosques(name)").order("created_at", { ascending: false }).limit(10),
    supabase.from("notifications").select("*").eq("user_id", user.id).is("read_at", null).order("created_at", { ascending: false }).limit(10),
  ]);
  const list = mosques.data ?? [];
  const used = (storage.data ?? []).reduce((s: number, r: { used_bytes: number }) => s + Number(r.used_bytes), 0);
  const quota = (storage.data ?? []).reduce((s: number, r: { quota_bytes: number }) => s + Number(r.quota_bytes), 0);

  return (
    <>
      <PageHeader title="Gambaran keseluruhan" description="Ringkasan semua masjid, permohonan dan paparan yang berhubung." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jumlah masjid" value={list.length} />
        <StatCard label="Masjid aktif" value={list.filter((m) => m.status === "active").length} />
        <StatCard label="Permohonan menunggu" value={pending.count ?? 0} tone="gold" hint={<Link className="underline" href="/master/approvals">Semak permohonan</Link>} />
        <StatCard label="Masjid digantung" value={list.filter((m) => m.status === "suspended").length} />
        <StatCard label="Pentadbir masjid aktif" value={admins.count ?? 0} />
        <StatCard label="Paparan dalam talian" value={sessions.count ?? 0} hint="Sesi pelayar dengan heartbeat dalam 3 minit" />
        <StatCard label="Storan digunakan" value={formatBytes(used)} hint={`daripada ${formatBytes(quota)} jumlah kuota`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardTitle action={<Link href="/master/audit-logs" className={buttonClass("ghost", "sm")}>Lihat semua</Link>}>Aktiviti terkini</CardTitle>
            <AuditTable rows={(audit.data ?? []) as unknown as AuditRow[]} showMosque />
          </Card>
        </div>
        <Card>
          <CardTitle action={(notes.data ?? []).length > 0 && (
            <form action={markNotificationsReadAction}><button className={buttonClass("ghost", "sm")}>Tandakan dibaca</button></form>
          )}>Notifikasi</CardTitle>
          <ul className="space-y-3">
            {(notes.data ?? []).map((n) => (
              <li key={n.id} className="rounded-lg bg-gold-100/60 p-3 text-sm">
                <p className="font-medium">{n.title}</p>
                <p className="text-black/65">{n.body}</p>
                <div className="mt-1 flex justify-between text-xs text-black/50">
                  <span>{formatDateTime(n.created_at)}</span>
                  {n.link && <Link href={n.link} className="font-medium text-brand-700">Buka →</Link>}
                </div>
              </li>
            ))}
            {(notes.data ?? []).length === 0 && <li className="text-sm text-black/55">Tiada notifikasi baharu.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
