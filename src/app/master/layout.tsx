import { DashboardShell } from "@/components/DashboardShell";
import { requireMaster } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireMaster();
  const { count } = await supabase
    .from("mosque_applications").select("id", { count: "exact", head: true }).eq("status", "pending_approval");
  const nav = [
    { href: "/master", label: "Gambaran Keseluruhan" },
    { href: "/master/approvals", label: "Kelulusan Pendaftaran", badge: count ?? 0 },
    { href: "/master/mosques", label: "Pengurusan Masjid" },
    { href: "/master/users", label: "Pengguna" },
    { href: "/master/storage", label: "Pemantauan Storan" },
    { href: "/master/displays", label: "Pemantauan Paparan" },
    { href: "/master/audit-logs", label: "Log Audit" },
    { href: "/master/settings", label: "Tetapan Sistem" },
  ];
  return (
    <DashboardShell nav={nav} home="/master" roleLabel="Master Super Admin" userName={profile.full_name || profile.email}>
      {children}
    </DashboardShell>
  );
}
