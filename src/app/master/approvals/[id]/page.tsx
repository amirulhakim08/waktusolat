import { notFound } from "next/navigation";
import { requireMaster } from "@/lib/auth";
import { Alert, Badge, Card, CardTitle, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { BackLink } from "@/components/DashboardShell";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { formatBytes, formatDateTime, STATUS_LABELS } from "@/lib/format";
import { slugify, uniqueSlug } from "@/lib/slug";
import { approveAction, rejectAction, requestInfoAction } from "../../actions";

export default async function ApplicationDetail({ params, searchParams }: PageProps<"/master/approvals/[id]">) {
  const { supabase, user } = await requireMaster();
  const { id } = await params;
  const sp = await searchParams;
  const { data: app } = await supabase.from("mosque_applications").select("*").eq("id", id).maybeSingle();
  if (!app) notFound();

  // Possible duplicates: similar names (same zone first) — helps spot existing mosques.
  const firstWord = app.mosque_name.replace(/^(masjid|surau)\s+/i, "").split(/\s+/)[0] ?? app.mosque_name;
  const [{ data: similar }, { data: taken }, { data: history }] = await Promise.all([
    supabase.from("mosques").select("id, name, slug, zone_code, district, status, mosque_admin_assignments(status, user_id)").ilike("name", `%${firstWord}%`).limit(10),
    supabase.from("mosques").select("slug").ilike("slug", `${slugify(app.mosque_name).slice(0, 40)}%`),
    supabase.from("mosque_applications").select("id, status, mosque_name, created_at").eq("applicant_id", app.applicant_id).neq("id", id),
  ]);
  const suggested = uniqueSlug(slugify(app.mosque_name), new Set((taken ?? []).map((t) => t.slug)));
  const reviewable = app.status === "pending_approval";
  const selfApp = app.applicant_id === user.id;

  return (
    <>
      <BackLink href="/master/approvals">Senarai permohonan</BackLink>
      <PageHeader title={app.mosque_name} description={`Permohonan oleh ${app.full_name}`}
        actions={<Badge tone={app.status === "approved" ? "green" : app.status === "rejected" ? "red" : "gold"}>{STATUS_LABELS[app.status]}</Badge>} />
      {sp.done === "approved" && <div className="mb-4"><Alert tone="success" title="Permohonan diluluskan">Masjid telah diaktifkan dan pentadbir dimaklumkan.</Alert></div>}
      {selfApp && <div className="mb-4"><Alert tone="error">Ini permohonan anda sendiri — anda tidak boleh menyemaknya.</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle>Maklumat pemohon & masjid</CardTitle>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {[
                ["Nama pemohon", app.full_name], ["Jawatan", app.applicant_position], ["E-mel", app.email], ["Telefon", app.phone],
                ["E-mel disahkan", app.email_verified_at ? formatDateTime(app.email_verified_at) : "Belum"],
                ["Nama masjid/surau", app.mosque_name], ["Alamat", app.address], ["Daerah", app.district], ["Negeri", app.state],
                ["Zon JAKIM", app.zone_code], ["Dihantar", formatDateTime(app.created_at)],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-xs uppercase text-black/50">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-5 rounded-lg bg-black/[.03] p-3 text-sm">
              <p className="text-xs uppercase text-black/50">Dokumen sokongan</p>
              {app.document_path ? (
                <a href={`/api/master/applications/${app.id}/document`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-medium text-brand-700 hover:underline">
                  {app.document_name ?? "Buka dokumen"} ({formatBytes(app.document_size)}) ↗
                </a>
              ) : <p className="mt-1">Tiada dokumen.</p>}
              <p className="mt-1 text-xs text-black/50">Pautan peribadi sementara (2 minit).</p>
            </div>
            {app.applicant_response && (
              <div className="mt-4 rounded-lg bg-sky-50 p-3 text-sm"><p className="text-xs uppercase text-sky-800">Maklum balas pemohon</p><p className="mt-1 whitespace-pre-wrap">{app.applicant_response}</p></div>
            )}
            {app.master_note && (
              <div className="mt-4 rounded-lg bg-gold-100 p-3 text-sm"><p className="text-xs uppercase text-gold-600">Catatan semakan</p><p className="mt-1 whitespace-pre-wrap">{app.master_note}</p></div>
            )}
          </Card>

          <Card>
            <CardTitle>Semakan pertindihan</CardTitle>
            {(similar ?? []).length === 0 ? <p className="text-sm text-black/60">Tiada masjid berdaftar dengan nama serupa.</p> : (
              <ul className="divide-y divide-black/5 text-sm">
                {(similar ?? []).map((m) => {
                  const hasAdmin = (m.mosque_admin_assignments as { status: string }[]).some((a) => a.status === "active");
                  return (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span><b>{m.name}</b> · /{m.slug} · {m.zone_code} · {m.district}</span>
                      <span className="flex gap-1">
                        <Badge tone={m.status === "active" ? "green" : "red"}>{STATUS_LABELS[m.status]}</Badge>
                        <Badge tone={hasAdmin ? "gold" : "gray"}>{hasAdmin ? "Ada pentadbir aktif" : "Tiada pentadbir"}</Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {(history ?? []).length > 0 && (
              <p className="mt-3 text-xs text-black/55">Pemohon ini mempunyai {history!.length} permohonan lain: {history!.map((h) => `${h.mosque_name} (${STATUS_LABELS[h.status]})`).join(", ")}</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {reviewable && !selfApp ? (
            <>
              <Card>
                <CardTitle>Luluskan</CardTitle>
                <ActionForm action={approveAction} className="space-y-4" confirm="Luluskan permohonan ini dan aktifkan akaun pentadbir?">
                  <input type="hidden" name="application_id" value={app.id} />
                  <Field label="Pautan awam (slug)" htmlFor="slug" hint={`Paparan TV: /${suggested}`}>
                    <Input id="slug" name="slug" defaultValue={suggested} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
                  </Field>
                  <Field label="Atau kaitkan dengan masjid sedia ada" htmlFor="existing_mosque_id" hint="Untuk menggantikan pentadbir masjid yang sudah berdaftar.">
                    <Select id="existing_mosque_id" name="existing_mosque_id" defaultValue="">
                      <option value="">— Cipta masjid baharu —</option>
                      {(similar ?? []).map((m) => <option key={m.id} value={m.id}>{m.name} (/{m.slug})</option>)}
                    </Select>
                  </Field>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="replace_admin" className="mt-1" />
                    <span>Gantikan pentadbir aktif sedia ada (akses lama akan ditarik balik dan direkodkan).</span>
                  </label>
                  <Field label="Catatan (pilihan)" htmlFor="approve_note"><Textarea id="approve_note" name="note" rows={2} /></Field>
                  <p className="text-xs text-black/55">Kuota storan lalai, tetapan slaid dan Mod Solat lalai akan dicipta secara automatik.</p>
                  <SubmitButton className="w-full">Luluskan permohonan</SubmitButton>
                </ActionForm>
              </Card>
              <Card>
                <CardTitle>Minta maklumat tambahan</CardTitle>
                <ActionForm action={requestInfoAction} className="space-y-3">
                  <input type="hidden" name="application_id" value={app.id} />
                  <Textarea name="note" rows={3} required minLength={5} placeholder="Cth. Sila kemukakan surat lantikan rasmi daripada AJK masjid." aria-label="Maklumat diperlukan" />
                  <SubmitButton variant="secondary" className="w-full">Hantar permintaan</SubmitButton>
                </ActionForm>
              </Card>
            </>
          ) : (
            <Alert tone="info">{app.status === "info_requested" ? "Menunggu maklum balas pemohon." : app.status === "pending_verification" ? "Pemohon belum mengesahkan e-mel. Permohonan belum boleh diluluskan." : "Keputusan telah dibuat."}</Alert>
          )}
          {["pending_approval", "info_requested", "pending_verification"].includes(app.status) && !selfApp && (
            <Card>
              <CardTitle>Tolak</CardTitle>
              <ActionForm action={rejectAction} className="space-y-3" confirm="Tolak permohonan ini?">
                <input type="hidden" name="application_id" value={app.id} />
                <Textarea name="note" rows={3} required minLength={5} placeholder="Sebab penolakan (akan dimaklumkan kepada pemohon)" aria-label="Sebab penolakan" />
                <SubmitButton variant="danger" className="w-full">Tolak permohonan</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
