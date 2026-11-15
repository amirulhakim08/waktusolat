import { notFound } from "next/navigation";
import { requireMaster } from "@/lib/auth";
import { Badge, Card, CardTitle, Field, Input, PageHeader, ProgressBar, Table, Textarea, buttonClass, td, th } from "@/components/ui";
import { BackLink } from "@/components/DashboardShell";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { AuditTable, type AuditRow } from "@/components/AuditTable";
import { formatBytes, formatDateTime, STATUS_LABELS, timeAgo } from "@/lib/format";
import { actAsMosqueAction, revokeAdminAction, setMosqueStatusAction, setQuotaAction, setSlugAction } from "../../actions";

export default async function MosqueDetail({ params }: PageProps<"/master/mosques/[id]">) {
  const { supabase } = await requireMaster();
  const { id } = await params;
  const { data: m } = await supabase.from("mosques").select("*").eq("id", id).maybeSingle();
  if (!m) notFound();
  const [{ data: assignments }, { data: storage }, { data: sessions }, { data: audit }, { data: pub }] = await Promise.all([
    supabase.from("mosque_admin_assignments")
      .select("id, status, assigned_at, revoked_at, revoke_reason, profiles!mosque_admin_assignments_user_id_fkey(email, full_name, phone)")
      .eq("mosque_id", id).order("assigned_at", { ascending: false }),
    supabase.rpc("get_storage_summary", { p_mosque_id: id }),
    supabase.from("display_sessions").select("*").eq("mosque_id", id).order("last_heartbeat_at", { ascending: false }).limit(20),
    supabase.from("audit_logs").select("id, action, created_at, details, target_type, target_id, actor:profiles(email, full_name)").eq("mosque_id", id).order("created_at", { ascending: false }).limit(15),
    supabase.from("mosque_publications").select("playlist_version_id, prayer_mode_published_at, playlist_versions(version, published_at)").eq("mosque_id", id).maybeSingle(),
  ]);
  type Assignment = { id: string; status: string; assigned_at: string; revoked_at: string | null; revoke_reason: string | null; profiles: { email: string; full_name: string; phone: string } | null };
  const list = (assignments ?? []) as unknown as Assignment[];
  const active = list.find((a) => a.status === "active");
  const s = storage?.[0];
  const pv = (pub as unknown as { playlist_versions: { version: number; published_at: string } | null } | null)?.playlist_versions;

  return (
    <>
      <BackLink href="/master/mosques">Senarai masjid</BackLink>
      <PageHeader title={m.name} description={`${m.address} · ${m.district}, ${m.state} · Zon ${m.zone_code}`}
        actions={<>
          <a href={`/${m.slug}`} target="_blank" className={buttonClass("secondary")}>Pratonton paparan ↗</a>
          <form action={actAsMosqueAction}><input type="hidden" name="mosque_id" value={m.id} /><button className={buttonClass("primary")}>Urus konfigurasi masjid</button></form>
        </>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle action={<Badge tone={m.status === "active" ? "green" : "red"}>{STATUS_LABELS[m.status]}</Badge>}>Ringkasan</CardTitle>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-xs uppercase text-black/50">Pautan awam</dt><dd className="font-medium">/{m.slug}</dd></div>
              <div><dt className="text-xs uppercase text-black/50">Pentadbir</dt><dd className="font-medium">{active?.profiles?.full_name ?? "Tiada"}<br /><span className="text-xs text-black/55">{active?.profiles?.email}</span></dd></div>
              <div><dt className="text-xs uppercase text-black/50">Playlist diterbitkan</dt><dd className="font-medium">{pv ? `Versi ${pv.version} · ${formatDateTime(pv.published_at)}` : "Belum"}</dd></div>
            </dl>
            {s && <div className="mt-5"><p className="mb-1 text-sm">Storan: {formatBytes(s.used_bytes)} / {formatBytes(s.quota_bytes)} · {s.image_count} gambar · {s.video_count} video</p><ProgressBar value={Number(s.used_bytes)} max={Number(s.quota_bytes)} /></div>}
            {m.status_reason && <p className="mt-4 text-sm text-black/60">Sebab status: {m.status_reason}</p>}
          </Card>
          <Card>
            <CardTitle>Sejarah pentadbir</CardTitle>
            <Table>
              <thead><tr><th className={th}>Pentadbir</th><th className={th}>Status</th><th className={th}>Dilantik</th><th className={th}>Ditarik balik</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {list.map((a) => (
                  <tr key={a.id}>
                    <td className={td}>{a.profiles?.full_name}<br /><span className="text-xs text-black/55">{a.profiles?.email} · {a.profiles?.phone}</span></td>
                    <td className={td}><Badge tone={a.status === "active" ? "green" : "gray"}>{STATUS_LABELS[a.status]}</Badge></td>
                    <td className={td}>{formatDateTime(a.assigned_at)}</td>
                    <td className={td}>{a.revoked_at ? <>{formatDateTime(a.revoked_at)}<br /><span className="text-xs text-black/55">{a.revoke_reason}</span></> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardTitle>Sesi paparan</CardTitle>
            <Table>
              <thead><tr><th className={th}>Heartbeat terakhir</th><th className={th}>Mod</th><th className={th}>Playlist</th><th className={th}>Skrin</th><th className={th}>Pelayar</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {(sessions ?? []).map((d) => (
                  <tr key={d.id}><td className={td}>{timeAgo(d.last_heartbeat_at)}</td><td className={td}>{d.mode}</td><td className={td}>v{d.playlist_version ?? "-"}</td><td className={td}>{d.screen}</td><td className={`${td} max-w-xs truncate text-xs`}>{d.user_agent}</td></tr>
                ))}
                {(sessions ?? []).length === 0 && <tr><td className={td} colSpan={5}>Tiada sesi direkodkan.</td></tr>}
              </tbody>
            </Table>
          </Card>
          <Card><CardTitle>Log audit masjid</CardTitle><AuditTable rows={(audit ?? []) as unknown as AuditRow[]} /></Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle>{m.status === "active" ? "Gantung masjid" : "Aktifkan semula"}</CardTitle>
            <ActionForm action={setMosqueStatusAction} className="space-y-3" confirm={m.status === "active" ? "Gantung masjid ini? Paparan TV dan akses pentadbir akan dihentikan." : undefined}>
              <input type="hidden" name="mosque_id" value={m.id} />
              <input type="hidden" name="status" value={m.status === "active" ? "suspended" : "active"} />
              <Textarea name="reason" rows={2} placeholder="Sebab (wajib untuk penggantungan)" aria-label="Sebab" />
              <SubmitButton variant={m.status === "active" ? "danger" : "primary"} className="w-full">{m.status === "active" ? "Gantung" : "Aktifkan semula"}</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardTitle>Kuota storan</CardTitle>
            <ActionForm action={setQuotaAction} className="space-y-3">
              <input type="hidden" name="mosque_id" value={m.id} />
              <Field label="Kuota (MB)" htmlFor="quota_mb"><Input id="quota_mb" name="quota_mb" type="number" min={1} max={10240} defaultValue={Math.round(Number(m.storage_quota_bytes) / 1048576)} /></Field>
              <SubmitButton variant="secondary" className="w-full">Kemas kini kuota</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardTitle>Pautan awam</CardTitle>
            <ActionForm action={setSlugAction} className="space-y-3">
              <input type="hidden" name="mosque_id" value={m.id} />
              <Field label="Slug" htmlFor="slug" hint="Pautan lama akan dialihkan secara automatik."><Input id="slug" name="slug" defaultValue={m.slug} /></Field>
              <SubmitButton variant="secondary" className="w-full">Tukar pautan</SubmitButton>
            </ActionForm>
          </Card>
          {active && (
            <Card>
              <CardTitle>Tarik balik pentadbir</CardTitle>
              <p className="mb-3 text-sm text-black/60">Untuk menggantikan pentadbir, tarik balik akses di sini, kemudian luluskan permohonan baharu dan kaitkan dengan masjid ini.</p>
              <ActionForm action={revokeAdminAction} className="space-y-3" confirm="Tarik balik akses pentadbir ini?">
                <input type="hidden" name="mosque_id" value={m.id} />
                <Textarea name="reason" rows={2} required minLength={5} placeholder="Sebab" aria-label="Sebab" />
                <SubmitButton variant="danger" className="w-full">Tarik balik akses</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
