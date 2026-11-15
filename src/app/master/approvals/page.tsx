import Link from "next/link";
import { requireMaster } from "@/lib/auth";
import { Badge, PageHeader, Table, td, th } from "@/components/ui";
import { formatDateTime, STATUS_LABELS } from "@/lib/format";

const TABS = {
  pending: { label: "Menunggu semakan", statuses: ["pending_approval", "info_requested"] },
  unverified: { label: "Belum sahkan e-mel", statuses: ["pending_verification"] },
  history: { label: "Sejarah keputusan", statuses: ["approved", "rejected"] },
} as const;

export default async function ApprovalsPage({ searchParams }: PageProps<"/master/approvals">) {
  const { supabase } = await requireMaster();
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "pending") as keyof typeof TABS;
  const { data } = await supabase.from("mosque_applications")
    .select("id, mosque_name, full_name, email, zone_code, status, created_at, reviewed_at")
    .in("status", [...TABS[tab].statuses]).order("created_at", { ascending: tab !== "history" }).limit(200);
  return (
    <>
      <PageHeader title="Kelulusan pendaftaran" description="Semak identiti pemohon, masjid dan dokumen kebenaran sebelum meluluskan." />
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(TABS).map(([k, v]) => (
          <Link key={k} href={`/master/approvals?tab=${k}`}
            className={`rounded-full px-3 py-1.5 text-sm ${tab === k ? "bg-brand-700 text-white" : "bg-white ring-1 ring-black/10"}`}>{v.label}</Link>
        ))}
      </div>
      <Table>
        <thead><tr><th className={th}>Masjid/Surau</th><th className={th}>Pemohon</th><th className={th}>Zon</th><th className={th}>Status</th><th className={th}>Tarikh</th><th className={th}></th></tr></thead>
        <tbody className="divide-y divide-black/5">
          {(data ?? []).map((a) => (
            <tr key={a.id}>
              <td className={`${td} font-medium`}>{a.mosque_name}</td>
              <td className={td}>{a.full_name}<br /><span className="text-xs text-black/55">{a.email}</span></td>
              <td className={td}>{a.zone_code}</td>
              <td className={td}><Badge tone={a.status === "approved" ? "green" : a.status === "rejected" ? "red" : "gold"}>{STATUS_LABELS[a.status]}</Badge></td>
              <td className={`${td} text-black/60`}>{formatDateTime(a.created_at)}</td>
              <td className={td}><Link className="font-medium text-brand-700 hover:underline" href={`/master/approvals/${a.id}`}>Semak →</Link></td>
            </tr>
          ))}
          {(data ?? []).length === 0 && <tr><td className={td} colSpan={6}>Tiada permohonan dalam kategori ini.</td></tr>}
        </tbody>
      </Table>
    </>
  );
}
