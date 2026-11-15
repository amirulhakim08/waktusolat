import { requireMaster } from "@/lib/auth";
import { Badge, PageHeader, Table, td, th } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

const ROLE = { master: ["Master Super Admin", "gold"], mosque_admin: ["Pentadbir Masjid", "green"], applicant: ["Pemohon", "gray"] } as const;

export default async function UsersPage() {
  const { supabase } = await requireMaster();
  const { data } = await supabase.from("profiles")
    .select("id, email, full_name, phone, role, created_at, mosque_admin_assignments!mosque_admin_assignments_user_id_fkey(status, mosques(name, slug))")
    .order("created_at", { ascending: false }).limit(500);
  type Row = { id: string; email: string; full_name: string; phone: string; role: keyof typeof ROLE; created_at: string; mosque_admin_assignments: { status: string; mosques: { name: string; slug: string } | null }[] };
  return (
    <>
      <PageHeader title="Pengguna" description="Semua akaun berdaftar. Peranan hanya boleh diubah melalui kelulusan atau penarikan balik yang diaudit." />
      <Table>
        <thead><tr><th className={th}>Nama</th><th className={th}>Peranan</th><th className={th}>Masjid</th><th className={th}>Telefon</th><th className={th}>Didaftarkan</th></tr></thead>
        <tbody className="divide-y divide-black/5">
          {((data ?? []) as unknown as Row[]).map((u) => {
            const active = u.mosque_admin_assignments.find((a) => a.status === "active")?.mosques;
            const [label, tone] = ROLE[u.role];
            return (
              <tr key={u.id}>
                <td className={td}>{u.full_name || "—"}<br /><span className="text-xs text-black/55">{u.email}</span></td>
                <td className={td}><Badge tone={tone}>{label}</Badge></td>
                <td className={td}>{active ? `${active.name} (/${active.slug})` : "—"}</td>
                <td className={td}>{u.phone || "—"}</td>
                <td className={td}>{formatDateTime(u.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
