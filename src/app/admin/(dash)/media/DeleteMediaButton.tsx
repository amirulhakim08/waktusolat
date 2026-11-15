"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function DeleteMediaButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function del() {
    if (!window.confirm(`Padam "${name}" secara kekal?`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/media/${id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(j.error ?? "Gagal memadam.");
    else router.refresh();
  }
  return (
    <div>
      <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" onClick={del} disabled={busy}>{busy ? "Memadam…" : "Padam"}</Button>
      {error && <p className="mt-1 text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}
