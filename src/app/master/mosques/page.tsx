import Link from "next/link";
import { nowMs } from "@/lib/time";
import { requireMaster } from "@/lib/auth";
import { Badge, Input, PageHeader, Table, td, th, buttonClass } from "@/components/ui";
import { formatBytes, STATUS_LABELS } from "@/lib/format";
import { DISPLAY_ONLINE_MS } from "@/lib/constants";

type Row = {
  id: string; name: string; slug: string; zone_code: string; district: string; state: string; status: string;
  mosque_admin_assignments: { status: string; profiles: { email: string; full_name: string } | null }[];
};

export default async function MosquesPage({ searchParams }: PageProps<"/master/mosques">) {
  const { supabase } = await requireMaster();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  let query = supabase.from("mosques")
    .select("id, name, slug, zone_code, district, state, status, mosque_admin_assignments(status, profiles!mosque_admin_assignments_user_id_fkey(email, full_name))")
    .order("name").limit(500);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%,district.ilike.%${safe}%,zone_code.ilike.%${safe}%`);
  }
  const since = new Date(nowMs() - DISPLAY_ONLINE_MS).toISOString();
  const [{ data }, { data: storage }, { data: sessions }] = await Promise.all([
    query,
    supabase.rpc("get_storage_summary"),
    supabase.from("display_sessions").select("mosque_id").gte("last_heartbeat_at", since),
  ]);
  type S = { mosque_id: string; used_bytes: number; quota_bytes: number };
  const used = new Map<string, S>(((storage ?? []) as S[]).map((s) => [s.mosque_id, s]));
  const online = new Map<string, number>();
  for (const s of sessions ?? []) online.set(s.mosque_id, (online.get(s.mosque_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Pengurusan masjid" description="Semua masjid dan surau berdaftar." />
      <form className="mb-4 flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Cari nama, slug, daerah atau zon…" aria-label="Cari masjid" />
        <button className={buttonClass("secondary")}>Cari</button>
      </form>
      <Table>
        <thead><tr><th className={th}>Masjid</th><th className={th}>Pentadbir</th><th className={th}>Zon</th><th className={th}>Storan</th><th className={th}>Paparan</th><th className={th}>Status</th><th className={th}></th></tr></thead>
        <tbody className="divide-y divide-black/5">
          {((data ?? []) as unknown as Row[]).map((m) => {
            const admin = m.mosque_admin_assignments.find((a) => a.status === "active")?.profiles;
            const s = used.get(m.id);
            return (
              <tr key={m.id}>
                <td className={td}><p className="font-medium">{m.name}</p><a href={`/${m.slug}`} target="_blank" className="text-xs text-brand-700 hover:underline">/{m.slug} ↗</a></td>
                <td className={td}>{admin ? <>{admin.full_name}<br /><span className="text-xs text-black/55">{admin.email}</span></> : <Badge tone="red">Tiada</Badge>}</td>
                <td className={td}>{m.zone_code}<br /><span className="text-xs text-black/55">{m.district}</span></td>
                <td className={td}>{s ? `${formatBytes(s.used_bytes)} / ${formatBytes(s.quota_bytes)}` : "—"}</td>
                <td className={td}>{online.get(m.id) ?? 0} dalam talian</td>
                <td className={td}><Badge tone={m.status === "active" ? "green" : "red"}>{STATUS_LABELS[m.status]}</Badge></td>
                <td className={td}><Link href={`/master/mosques/${m.id}`} className="font-medium text-brand-700 hover:underline">Urus →</Link></td>
              </tr>
            );
          })}
          {(data ?? []).length === 0 && <tr><td className={td} colSpan={7}>Tiada masjid ditemui.</td></tr>}
        </tbody>
      </Table>
    </>
  );
}
