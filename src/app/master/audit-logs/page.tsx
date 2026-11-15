import Link from "next/link";
import { requireMaster } from "@/lib/auth";
import { PageHeader, Select, buttonClass } from "@/components/ui";
import { AuditTable, type AuditRow } from "@/components/AuditTable";
import { AUDIT_LABELS } from "@/lib/audit-labels";

const PAGE = 50;

export default async function AuditLogsPage({ searchParams }: PageProps<"/master/audit-logs">) {
  const { supabase } = await requireMaster();
  const sp = await searchParams;
  const action = typeof sp.action === "string" && sp.action in AUDIT_LABELS ? sp.action : "";
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  let q = supabase.from("audit_logs")
    .select("id, action, created_at, details, target_type, target_id, actor:profiles(email, full_name), mosque:mosques(name)")
    .order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (action) q = q.eq("action", action);
  const { data } = await q;
  const qs = (p: number) => `/master/audit-logs?${new URLSearchParams({ ...(action ? { action } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Log audit" description="Rekod tindakan pentadbiran. Log ini tidak boleh diubah atau dipadam." />
      <form className="mb-4 flex max-w-md gap-2">
        <Select name="action" defaultValue={action} aria-label="Tapis tindakan">
          <option value="">Semua tindakan</option>
          {Object.entries(AUDIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <button className={buttonClass("secondary")}>Tapis</button>
      </form>
      <AuditTable rows={(data ?? []) as unknown as AuditRow[]} showMosque />
      <div className="mt-4 flex gap-2">
        {page > 0 && <Link className={buttonClass("secondary", "sm")} href={qs(page - 1)}>← Sebelum</Link>}
        {(data ?? []).length === PAGE && <Link className={buttonClass("secondary", "sm")} href={qs(page + 1)}>Seterusnya →</Link>}
      </div>
    </>
  );
}
