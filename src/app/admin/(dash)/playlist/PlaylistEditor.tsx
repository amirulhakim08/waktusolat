"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Input, buttonClass } from "@/components/ui";
import { ItemSettingsFields, type ItemSettingsValue } from "@/components/admin/ItemSettingsFields";
import { TRANSITION_LABELS } from "@/lib/constants";
import { publishPlaylistAction, savePlaylistDraftAction } from "@/app/admin/actions";

export interface EditorItem extends ItemSettingsValue {
  id: string;
  media: { id: string; name: string; kind: "image" | "video"; url: string };
}

export function PlaylistEditor({ playlistId, initialName, initialItems }: { playlistId: string; initialName: string; initialItems: EditorItem[] }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState(initialItems);
  const [open, setOpen] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  // Pick up server changes (e.g. media added) when there are no local edits.
  const [prevInitial, setPrevInitial] = useState(initialItems);
  if (prevInitial !== initialItems) {
    setPrevInitial(initialItems);
    if (!dirty) setItems(initialItems);
  }

  const update = (next: EditorItem[]) => { setItems(next); setDirty(true); setResult(null); };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    update(next);
  };

  const payload = () => ({
    playlist_id: playlistId,
    name,
    items: items.map(({ id, duration_seconds, transition, transition_ms, fit, is_active }) => ({ id, duration_seconds, transition, transition_ms, fit, is_active })),
  });

  const save = (publish: boolean) => start(async () => {
    const r = await savePlaylistDraftAction(payload());
    if (!r.ok) { setResult({ ok: false, text: r.error }); return; }
    setDirty(false);
    if (publish) {
      const p = await publishPlaylistAction(playlistId);
      setResult(p.ok ? { ok: true, text: p.message ?? "Diterbitkan." } : { ok: false, text: p.error });
    } else setResult({ ok: true, text: r.message ?? "Disimpan." });
    router.refresh();
  });

  const activeCount = items.filter((i) => i.is_active).length;
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-60">
          <label htmlFor="pl-name" className="text-xs font-medium uppercase text-black/50">Nama playlist</label>
          <Input id="pl-name" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/preview?playlist=${playlistId}`} className={buttonClass("secondary")} aria-disabled={dirty}
            onClick={(e) => { if (dirty && !window.confirm("Perubahan belum disimpan. Pratonton akan menunjukkan draf terakhir yang disimpan. Teruskan?")) e.preventDefault(); }}>
            Pratonton Draf
          </Link>
          <Button variant="secondary" disabled={pending} onClick={() => save(false)}>Simpan Draf</Button>
          <Button variant="gold" disabled={pending} onClick={() => { if (window.confirm(`Terbitkan ${activeCount} item aktif ke semua paparan TV?`)) save(true); }}>Terbitkan ke TV</Button>
        </div>
      </div>
      {dirty && <div className="mb-3"><Alert tone="warning">Terdapat perubahan yang belum disimpan.</Alert></div>}
      {result && <div className="mb-3"><Alert tone={result.ok ? "success" : "error"}>{result.text}</Alert></div>}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 p-8 text-center text-sm text-black/55">Playlist kosong. Tambah media daripada pustaka di bawah.</p>
      ) : (
        <ol className="space-y-2" aria-label="Item playlist (seret untuk susun semula)">
          {items.map((it, i) => (
            <li key={it.id}
              draggable
              onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); }}
              onDragEnd={() => setDragIndex(null)}
              className={`rounded-xl bg-white ring-1 ${dragIndex === i ? "opacity-50 ring-brand-500" : "ring-black/10"} ${it.is_active ? "" : "bg-black/[.02]"}`}
              data-testid="playlist-item">
              <div className="flex items-center gap-3 p-2">
                <span className="cursor-grab select-none px-1 text-black/40" title="Seret untuk susun" aria-hidden>⋮⋮</span>
                <span className="w-6 text-center text-sm font-semibold text-black/50">{i + 1}</span>
                <div className="h-14 w-24 shrink-0 overflow-hidden rounded-md bg-brand-950">
                  {it.media.kind === "image"
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={it.media.url} alt="" className="h-full w-full object-contain" loading="lazy" />
                    : <div className="flex h-full items-center justify-center text-xs text-white/70">VIDEO</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${it.is_active ? "" : "text-black/40 line-through"}`}>{it.media.name}</p>
                  <p className="text-xs text-black/55">{it.duration_seconds} saat · {TRANSITION_LABELS[it.transition]} · {it.transition === "none" ? "—" : `${it.transition_ms / 1000} s`} · {it.fit === "cover" ? "Isi skrin" : "Penuh"}</p>
                </div>
                {!it.is_active && <Badge>Tidak aktif</Badge>}
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" aria-label="Naik" onClick={() => move(i, i - 1)} disabled={i === 0}>↑</Button>
                  <Button variant="ghost" size="sm" aria-label="Turun" onClick={() => move(i, i + 1)} disabled={i === items.length - 1}>↓</Button>
                  <Button variant="secondary" size="sm" onClick={() => setOpen(open === it.id ? null : it.id)} aria-expanded={open === it.id}>Tetapan</Button>
                  <Button variant="ghost" size="sm" className="text-red-700" onClick={() => update(items.filter((x) => x.id !== it.id))}>Buang</Button>
                </div>
              </div>
              {open === it.id && (
                <div className="border-t border-black/5 p-4">
                  <ItemSettingsFields idPrefix={it.id} kind={it.media.kind} value={it}
                    onChange={(v) => update(items.map((x) => (x.id === it.id ? { ...x, ...v } : x)))} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-black/50">Seret item atau guna butang ↑ ↓ untuk menyusun. Perubahan hanya dipaparkan di TV selepas “Terbitkan ke TV”.</p>
    </Card>
  );
}
