export function formatBytes(bytes: number | string | null | undefined): string {
  const b = Number(bytes ?? 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const dtf = new Intl.DateTimeFormat("ms-MY", {
  timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dtf.format(d);
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "tidak pernah";
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.max(s, 0)} saat lalu`;
  if (s < 3600) return `${Math.round(s / 60)} minit lalu`;
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
  return `${Math.round(s / 86400)} hari lalu`;
}

export const STATUS_LABELS: Record<string, string> = {
  pending_verification: "Menunggu pengesahan e-mel",
  pending_approval: "Menunggu kelulusan",
  info_requested: "Maklumat tambahan diminta",
  approved: "Diluluskan",
  rejected: "Ditolak",
  active: "Aktif",
  suspended: "Digantung",
  revoked: "Ditarik balik",
};
