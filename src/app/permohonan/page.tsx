import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Alert, Badge, Field, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { requireUser } from "@/lib/auth";
import { formatDateTime, STATUS_LABELS } from "@/lib/format";
import { logoutAction } from "../login/actions";
import { respondInfoAction } from "./actions";

export const metadata: Metadata = { title: "Status Permohonan" };

const tone = { pending_verification: "gold", pending_approval: "blue", info_requested: "gold", approved: "green", rejected: "red" } as const;

export const dynamic = "force-dynamic";

export default async function ApplicationStatusPage() {
  const { supabase, profile, user } = await requireUser();
  const [{ data: apps }, { data: assignment }] = await Promise.all([
    supabase.from("mosque_applications").select("*").eq("applicant_id", user.id).order("created_at", { ascending: false }),
    supabase.from("mosque_admin_assignments").select("status, revoke_reason, revoked_at").eq("user_id", user.id).order("assigned_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: mosqueId } = await supabase.rpc("admin_mosque_id");

  return (
    <AuthShell wide title="Status akaun & permohonan" subtitle={profile.email}>
      <div className="space-y-6">
        {mosqueId && (
          <Alert tone="success" title="Akaun anda aktif">
            <Link href="/admin" className="font-medium underline">Buka papan pemuka masjid →</Link>
          </Alert>
        )}
        {profile.role === "mosque_admin" && !mosqueId && (
          <Alert tone="warning" title="Akses sementara tidak tersedia">
            Akaun masjid anda sedang digantung oleh pentadbir sistem. Sila hubungi pentadbir sistem untuk maklumat lanjut.
          </Alert>
        )}
        {assignment?.status === "revoked" && profile.role !== "mosque_admin" && (
          <Alert tone="warning" title="Akses pentadbir telah ditarik balik">{assignment.revoke_reason}</Alert>
        )}
        {(apps ?? []).length === 0 && !mosqueId && (
          <Alert tone="info">Tiada permohonan ditemui. <Link className="underline" href="/register">Hantar permohonan baharu</Link>.</Alert>
        )}
        {(apps ?? []).map((a) => (
          <article key={a.id} className="rounded-xl p-4 ring-1 ring-black/10" data-testid="application">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{a.mosque_name}</h2>
              <Badge tone={tone[a.status as keyof typeof tone] ?? "gray"}>{STATUS_LABELS[a.status] ?? a.status}</Badge>
            </div>
            <p className="mt-1 text-xs text-black/55">Dihantar {formatDateTime(a.created_at)} · Zon {a.zone_code}</p>
            {a.status === "pending_verification" && (
              <p className="mt-3 text-sm text-black/70">Sila klik pautan pengesahan yang dihantar ke e-mel anda. Permohonan akan dihantar untuk semakan selepas e-mel disahkan.</p>
            )}
            {a.status === "pending_approval" && (
              <p className="mt-3 text-sm text-black/70">Permohonan anda sedang disemak oleh pentadbir sistem. Anda akan dimaklumkan selepas keputusan dibuat.</p>
            )}
            {a.master_note && (
              <div className="mt-3 rounded-lg bg-black/[.03] p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-black/50">Catatan pentadbir sistem</p>
                <p className="mt-1 whitespace-pre-wrap">{a.master_note}</p>
              </div>
            )}
            {a.status === "info_requested" && (
              <ActionForm action={respondInfoAction} className="mt-4 space-y-3">
                <input type="hidden" name="application_id" value={a.id} />
                <Field label="Maklum balas anda" htmlFor={`resp-${a.id}`} hint="Terangkan maklumat tambahan yang diminta.">
                  <Textarea id={`resp-${a.id}`} name="response" rows={4} required minLength={5} maxLength={2000} />
                </Field>
                <SubmitButton>Hantar maklum balas</SubmitButton>
              </ActionForm>
            )}
          </article>
        ))}
        <form action={logoutAction}>
          <button className="text-sm font-medium text-black/60 hover:text-black">Log keluar</button>
        </form>
      </div>
    </AuthShell>
  );
}
