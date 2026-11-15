"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardTitle, Field, Input, Select } from "@/components/ui";
import { DEFAULT_ITEM_SETTINGS, ItemSettingsFields, type ItemSettingsValue } from "@/components/admin/ItemSettingsFields";
import { formatBytes } from "@/lib/format";

const MAX_IMAGE = 2 * 1024 * 1024;

/** Sniff magic bytes client-side for fast feedback (server re-validates). */
async function sniff(file: File): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && s(1, 3) === "PNG") return "image/png";
  if (s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return "image/webp";
  if (s(4, 4) === "ftyp") return "video/mp4";
  return null;
}

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    const form = new FormData();
    form.append("cacheControl", "31536000");
    form.append("", file);
    xhr.send(form);
  });
}

export function MediaUploader({ mosqueId, playlists, maxVideoBytes, remainingBytes, defaults }: {
  mosqueId: string; playlists: { id: string; name: string }[]; maxVideoBytes: number; remainingBytes: number; defaults: ItemSettingsValue;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"image" | "video">("image");
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [settings, setSettings] = useState<ItemSettingsValue>(defaults ?? DEFAULT_ITEM_SETTINGS);
  const [playlistId, setPlaylistId] = useState(playlists[0]?.id ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(f: File | undefined) {
    setError(null);
    setSuccess(null);
    if (!f) return;
    const type = await sniff(f);
    if (!type || (type !== f.type && !(type === "image/jpeg" && f.type === "image/jpg"))) {
      setError("Format tidak disokong. Gunakan JPEG, PNG, WebP atau video MP4 (H.264).");
      return;
    }
    const isVideo = type === "video/mp4";
    if (!isVideo && f.size > MAX_IMAGE) { setError(`Gambar melebihi 2 MB (${formatBytes(f.size)}). Sila kecilkan saiz gambar.`); return; }
    if (isVideo && f.size > maxVideoBytes) { setError(`Video melebihi had ${formatBytes(maxVideoBytes)}.`); return; }
    if (f.size > remainingBytes) { setError(`Ruang storan tidak mencukupi (baki ${formatBytes(remainingBytes)}).`); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setKind(isVideo ? "video" : "image");
    setPreview(URL.createObjectURL(f));
    setName(f.name.replace(/\.[^.]+$/, "").slice(0, 120));
    if (isVideo) setSettings((s) => ({ ...s, duration_seconds: 30 }));
  }

  async function upload() {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
      const intent = await fetch("/api/admin/media/upload-intent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mosque_id: mosqueId, name: name || file.name, mime, size: file.size }),
      });
      const ij = await intent.json();
      if (!intent.ok) throw new Error(ij.error ?? "Muat naik ditolak.");
      await putWithProgress(ij.upload_url, file, setProgress);
      const fin = await fetch(`/api/admin/media/${ij.asset_id}/finalize`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_id: playlistId || null, settings }),
      });
      const fj = await fin.json();
      if (!fin.ok) throw new Error(fj.error ?? "Pengesahan fail gagal.");
      setSuccess(fj.warning ?? (playlistId ? "Media dimuat naik dan ditambah ke draf playlist. Terbitkan playlist untuk memaparkannya di TV." : "Media dimuat naik ke pustaka."));
      setFile(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message !== "network" ? e.message : "Muat naik gagal. Semak sambungan internet dan cuba lagi.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <Card>
      <CardTitle>Muat naik media</CardTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Field label="Pilih fail" htmlFor="file" hint="Gambar: JPEG, PNG, WebP (maks 2 MB). Video: MP4 H.264 (pilihan, tanpa bunyi).">
            <Input ref={inputRef} id="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={(e) => choose(e.target.files?.[0])} disabled={progress !== null} />
          </Field>
          <div className="mt-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-brand-950 ring-1 ring-black/10">
            {preview ? (kind === "image"
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={preview} alt="Pratonton" className="h-full w-full" style={{ objectFit: settings.fit }} />
              : <video src={preview} className="h-full w-full" style={{ objectFit: settings.fit }} muted autoPlay loop playsInline />)
              : <p className="text-sm text-white/50">Pratonton akan dipaparkan di sini (nisbah 16:9)</p>}
          </div>
          {file && <p className="mt-2 text-xs text-black/55">{file.name} · {formatBytes(file.size)}</p>}
        </div>
        <div className="space-y-4">
          <Field label="Nama media" htmlFor="media-name" hint="Cth. Poster Kuliah Maghrib">
            <Input id="media-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={!file} />
          </Field>
          <ItemSettingsFields idPrefix="new" value={settings} onChange={setSettings} kind={kind} />
          <Field label="Tambah ke playlist (draf)" htmlFor="playlist">
            <Select id="playlist" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
              <option value="">— Simpan dalam pustaka sahaja —</option>
              {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          {progress !== null && (
            <div aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} /></div>
              <p className="mt-1 text-xs text-black/60">{progress < 100 ? `Memuat naik… ${progress}%` : "Mengesahkan & mengoptimumkan…"}</p>
            </div>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}
          <Button onClick={upload} disabled={!file || progress !== null}>{progress !== null ? "Sedang memuat naik…" : "Muat naik"}</Button>
        </div>
      </div>
    </Card>
  );
}
