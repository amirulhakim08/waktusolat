import Link from "next/link";
import { requireMosqueAdmin } from "@/lib/auth";
import { Alert, PageHeader, buttonClass } from "@/components/ui";
import { PRAYER_LABELS } from "@/lib/prayer/types";

export default async function PreviewPage({ searchParams }: PageProps<"/admin/preview">) {
  const { mosque } = await requireMosqueAdmin();
  const sp = await searchParams;
  const view = sp.view === "live" ? "live" : "draft";
  const params = new URLSearchParams();
  for (const k of ["playlist", "simulate", "prayer"]) if (typeof sp[k] === "string") params.set(k, sp[k] as string);
  const src = view === "live" ? `/${mosque.slug}` : `/admin/frame?${params}`;
  const link = (extra: Record<string, string>) => `/admin/preview?${new URLSearchParams({ ...Object.fromEntries(params), ...extra })}`;
  return (
    <>
      <PageHeader title="Pratonton paparan" description="Lihat draf sebelum diterbitkan, atau paparan langsung seperti di TV."
        actions={<a href={`/${mosque.slug}`} target="_blank" className={buttonClass("secondary")}>Buka paparan TV ↗</a>} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/preview" className={buttonClass(view === "draft" && !sp.simulate ? "primary" : "secondary", "sm")}>Draf (mod biasa)</Link>
        <Link href={link({ simulate: "countdown", prayer: (sp.prayer as string) ?? "maghrib" })} className={buttonClass(sp.simulate === "countdown" ? "primary" : "secondary", "sm")}>Simulasi countdown</Link>
        <Link href={link({ simulate: "solat", prayer: (sp.prayer as string) ?? "maghrib" })} className={buttonClass(sp.simulate === "solat" ? "primary" : "secondary", "sm")}>Simulasi Mod Solat</Link>
        <Link href="/admin/preview?view=live" className={buttonClass(view === "live" ? "primary" : "secondary", "sm")}>Paparan langsung (diterbitkan)</Link>
      </div>
      {sp.simulate && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {(["subuh", "zohor", "asar", "maghrib", "isyak", "jumaat"] as const).map((p) => (
            <Link key={p} href={link({ prayer: p })} className={`rounded-full px-2.5 py-1 ${sp.prayer === p ? "bg-gold-500 text-brand-950" : "bg-white ring-1 ring-black/10"}`}>{PRAYER_LABELS[p]}</Link>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-black shadow-lg ring-1 ring-black/10">
        <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
          <iframe src={src} title="Pratonton paparan TV" className="absolute inset-0 h-full w-full border-0" />
        </div>
      </div>
      <div className="mt-4"><Alert tone="info">Pratonton draf hanya kelihatan kepada anda dan tidak menjejaskan TV. Simulasi tidak dihantar ke paparan sebenar.</Alert></div>
    </>
  );
}
