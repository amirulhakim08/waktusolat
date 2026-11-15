import Link from "next/link";
import { requireMosqueAdmin } from "@/lib/auth";
import { Card, CardTitle, EmptyState, Input, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { mediaUrl } from "@/lib/slideshow";
import { formatDateTime } from "@/lib/format";
import { addToPlaylistAction, createPlaylistAction, deletePlaylistAction } from "@/app/admin/actions";
import { PlaylistEditor, type EditorItem } from "./PlaylistEditor";

export default async function PlaylistPage({ searchParams }: PageProps<"/admin/playlist">) {
  const { supabase, mosqueId } = await requireMosqueAdmin();
  const sp = await searchParams;
  const { data: playlists } = await supabase.from("playlists").select("id, name, updated_at").eq("mosque_id", mosqueId).order("created_at");
  const current = (playlists ?? []).find((p) => p.id === sp.id) ?? playlists?.[0];
  const [{ data: rawItems }, { data: media }, { data: pub }] = await Promise.all([
    current
      ? supabase.from("playlist_items").select("id, position, duration_seconds, transition, transition_ms, fit, is_active, media:media_assets(id, name, kind, storage_path)").eq("playlist_id", current.id).order("position")
      : Promise.resolve({ data: [] }),
    supabase.from("media_assets").select("id, name, kind, storage_path").eq("mosque_id", mosqueId).eq("status", "ready").order("created_at", { ascending: false }),
    supabase.from("mosque_publications").select("playlist_versions(version, published_at, playlist_id, playlist_name)").eq("mosque_id", mosqueId).maybeSingle(),
  ]);
  type Raw = { id: string; duration_seconds: number; transition: EditorItem["transition"]; transition_ms: number; fit: EditorItem["fit"]; is_active: boolean; media: { id: string; name: string; kind: "image" | "video"; storage_path: string } };
  const items: EditorItem[] = ((rawItems ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id, duration_seconds: r.duration_seconds, transition: r.transition, transition_ms: r.transition_ms, fit: r.fit, is_active: r.is_active,
    media: { id: r.media.id, name: r.media.name, kind: r.media.kind, url: mediaUrl(r.media.storage_path) },
  }));
  const inList = new Set(items.map((i) => i.media.id));
  const available = (media ?? []).filter((m) => !inList.has(m.id));
  const live = (pub as unknown as { playlist_versions: { version: number; published_at: string; playlist_id: string; playlist_name: string } | null } | null)?.playlist_versions;

  return (
    <>
      <PageHeader title="Pengurus playlist" description="Susun slaid, tetapkan setiap gambar, simpan draf dan terbitkan ke TV." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(playlists ?? []).map((p) => (
          <Link key={p.id} href={`/admin/playlist?id=${p.id}`}
            className={`rounded-full px-3 py-1.5 text-sm ${p.id === current?.id ? "bg-brand-700 text-white" : "bg-white ring-1 ring-black/10"}`}>
            {p.name}{live?.playlist_id === p.id ? " • di TV" : ""}
          </Link>
        ))}
        <ActionForm action={createPlaylistAction} className="flex gap-2" resetOnSuccess>
          <Input name="name" placeholder="Playlist baharu" className="w-44 py-1.5" required maxLength={80} aria-label="Nama playlist baharu" />
          <SubmitButton variant="secondary" pendingText="…">Cipta</SubmitButton>
        </ActionForm>
      </div>
      {live && <p className="mb-4 text-sm text-black/60">Sedang dipaparkan di TV: <b>{live.playlist_name}</b> versi {live.version} (diterbitkan {formatDateTime(live.published_at)}).</p>}
      {current ? (
        <div className="space-y-6">
          <PlaylistEditor key={current.id} playlistId={current.id} initialName={current.name} initialItems={items} />
          <Card>
            <CardTitle>Tambah daripada pustaka media</CardTitle>
            {available.length === 0 ? <EmptyState title="Tiada media lain">Semua media telah berada dalam playlist ini, atau <Link className="underline" href="/admin/media">muat naik media baharu</Link>.</EmptyState> : (
              <ActionForm action={addToPlaylistAction} className="space-y-3">
                <input type="hidden" name="playlist_id" value={current.id} />
                <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {available.map((m) => (
                    <li key={m.id}>
                      <label className="block cursor-pointer overflow-hidden rounded-xl ring-1 ring-black/10 has-[:checked]:ring-2 has-[:checked]:ring-brand-600">
                        <div className="aspect-video bg-brand-950">
                          {m.kind === "image"
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={mediaUrl(m.storage_path)} alt="" className="h-full w-full object-contain" loading="lazy" />
                            : <div className="flex h-full items-center justify-center text-xs text-white/70">VIDEO</div>}
                        </div>
                        <span className="flex items-center gap-2 p-2 text-xs"><input type="checkbox" name="media_id" value={m.id} /> <span className="truncate">{m.name}</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
                <SubmitButton variant="secondary">Tambah media dipilih</SubmitButton>
              </ActionForm>
            )}
          </Card>
          {(playlists ?? []).length > 1 && live?.playlist_id !== current.id && (
            <ActionForm action={deletePlaylistAction} confirm={`Padam playlist "${current.name}"?`}>
              <input type="hidden" name="playlist_id" value={current.id} />
              <SubmitButton variant="ghost" className="text-red-700">Padam playlist ini</SubmitButton>
            </ActionForm>
          )}
        </div>
      ) : <EmptyState title="Tiada playlist" />}
    </>
  );
}
