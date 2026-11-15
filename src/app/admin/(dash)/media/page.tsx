import { requireMosqueAdmin } from "@/lib/auth";
import { Alert, Badge, EmptyState, Input, PageHeader, ProgressBar } from "@/components/ui";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { formatBytes, formatDateTime } from "@/lib/format";
import { mediaUrl } from "@/lib/slideshow";
import type { Fit, Transition } from "@/lib/constants";
import { renameMediaAction, setLogoAction } from "@/app/admin/actions";
import { MediaUploader } from "./MediaUploader";
import { DeleteMediaButton } from "./DeleteMediaButton";

export default async function MediaPage() {
  const { supabase, mosqueId, mosque } = await requireMosqueAdmin();
  const [{ data: media }, { data: playlists }, { data: storage }, { data: settings }, { data: used }] = await Promise.all([
    supabase.from("media_assets").select("*").eq("mosque_id", mosqueId).eq("status", "ready").order("created_at", { ascending: false }),
    supabase.from("playlists").select("id, name").eq("mosque_id", mosqueId).order("created_at"),
    supabase.rpc("get_storage_summary", { p_mosque_id: mosqueId }),
    supabase.from("system_settings").select("max_video_bytes, default_slide_duration_seconds, default_transition, default_transition_ms, default_fit").eq("id", 1).single(),
    supabase.from("playlist_items").select("media_id").eq("mosque_id", mosqueId),
  ]);
  const s = storage?.[0];
  const remaining = s ? Math.max(0, Number(s.quota_bytes) - Number(s.used_bytes)) : 0;
  const pct = s ? (Number(s.used_bytes) / Number(s.quota_bytes)) * 100 : 0;
  const inPlaylist = new Set((used ?? []).map((u) => u.media_id));

  return (
    <>
      <PageHeader title="Pustaka media" description="Muat naik poster dan pengumuman. Setiap gambar boleh ditetapkan tempoh dan kesan pertukaran sendiri." />
      {s && (
        <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="mb-2 flex justify-between text-sm"><span>Storan: <b>{formatBytes(s.used_bytes)}</b> / {formatBytes(s.quota_bytes)}</span><span className="text-black/55">Baki {formatBytes(remaining)}</span></div>
          <ProgressBar value={Number(s.used_bytes)} max={Number(s.quota_bytes)} />
          {pct >= 80 && <div className="mt-3"><Alert tone={pct >= 95 ? "error" : "warning"}>{pct >= 100 ? "Storan penuh — muat naik baharu akan ditolak." : `Storan ${Math.round(pct)}% digunakan.`}</Alert></div>}
        </div>
      )}
      <MediaUploader mosqueId={mosqueId} playlists={playlists ?? []} maxVideoBytes={Number(settings?.max_video_bytes ?? 52428800)} remainingBytes={remaining}
        defaults={{ duration_seconds: settings?.default_slide_duration_seconds ?? 10, transition: (settings?.default_transition ?? "fade") as Transition, transition_ms: settings?.default_transition_ms ?? 1000, fit: (settings?.default_fit ?? "contain") as Fit, is_active: true }} />
      <h2 className="mb-3 mt-8 text-lg font-semibold">Media tersimpan ({media?.length ?? 0})</h2>
      {(media ?? []).length === 0 ? <EmptyState title="Belum ada media">Muat naik poster pertama anda di atas.</EmptyState> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(media ?? []).map((m) => (
            <li key={m.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
              <div className="aspect-video bg-brand-950">
                {m.kind === "image"
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={mediaUrl(m.storage_path)} alt={m.name} loading="lazy" className="h-full w-full object-contain" />
                  : <video src={mediaUrl(m.storage_path)} className="h-full w-full object-contain" muted preload="metadata" />}
              </div>
              <div className="space-y-2 p-3">
                <ActionForm action={renameMediaAction} className="flex gap-2">
                  <input type="hidden" name="media_id" value={m.id} />
                  <Input name="name" defaultValue={m.name} maxLength={120} aria-label="Nama media" className="py-1.5" />
                  <SubmitButton variant="secondary" pendingText="…">Simpan</SubmitButton>
                </ActionForm>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-black/55">
                  <Badge tone={m.kind === "image" ? "green" : "blue"}>{m.kind === "image" ? "Gambar" : "Video"}</Badge>
                  {inPlaylist.has(m.id) && <Badge tone="gold">Dalam playlist</Badge>}
                  {mosque.logo_asset_id === m.id && <Badge tone="gold">Logo</Badge>}
                  <span>{formatBytes(m.size_bytes)}{m.width ? ` · ${m.width}×${m.height}` : ""}</span>
                </div>
                <p className="text-xs text-black/45">{formatDateTime(m.created_at)}</p>
                <div className="flex items-center justify-between">
                  {m.kind === "image" && mosque.logo_asset_id !== m.id ? (
                    <ActionForm action={setLogoAction}><input type="hidden" name="logo_asset_id" value={m.id} /><SubmitButton variant="ghost" pendingText="…">Jadikan logo</SubmitButton></ActionForm>
                  ) : <span />}
                  <DeleteMediaButton id={m.id} name={m.name} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
