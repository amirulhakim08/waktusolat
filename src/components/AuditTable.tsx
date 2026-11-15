import { Table, td, th } from "./ui";
import { auditLabel } from "@/lib/audit-labels";
import { formatDateTime } from "@/lib/format";

export interface AuditRow {
  id: number; action: string; created_at: string; details: Record<string, unknown>;
  target_type: string | null; target_id: string | null;
  actor?: { email: string; full_name: string } | null; mosque?: { name: string } | null;
}

function summarize(d: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d ?? {})) {
    if (v === null || typeof v === "object") continue;
    parts.push(`${k}: ${String(v)}`);
    if (parts.length >= 4) break;
  }
  return parts.join(" · ");
}

export function AuditTable({ rows, showMosque }: { rows: AuditRow[]; showMosque?: boolean }) {
  return (
    <Table>
      <thead><tr><th className={th}>Masa</th><th className={th}>Tindakan</th>{showMosque && <th className={th}>Masjid</th>}<th className={th}>Oleh</th><th className={th}>Butiran</th></tr></thead>
      <tbody className="divide-y divide-black/5">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={`${td} whitespace-nowrap text-black/60`}>{formatDateTime(r.created_at)}</td>
            <td className={td}>{auditLabel(r.action)}</td>
            {showMosque && <td className={td}>{r.mosque?.name ?? "—"}</td>}
            <td className={td}>{r.actor?.full_name || r.actor?.email || "Sistem"}</td>
            <td className={`${td} max-w-md truncate text-xs text-black/60`} title={JSON.stringify(r.details)}>{summarize(r.details)}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td className={td} colSpan={5}>Tiada rekod.</td></tr>}
      </tbody>
    </Table>
  );
}
