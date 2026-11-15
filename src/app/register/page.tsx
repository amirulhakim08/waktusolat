import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/ui";
import { listZones } from "@/lib/zones";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Daftar Masjid / Surau" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const zones = await listZones();
  return (
    <AuthShell wide title="Daftar masjid / surau" subtitle="Permohonan akan disemak oleh pentadbir sistem sebelum akaun diaktifkan.">
      {zones.length === 0 && <div className="mb-6"><Alert tone="warning">Senarai zon belum tersedia. Sistem mungkin belum dikonfigurasi sepenuhnya.</Alert></div>}
      <RegisterForm zones={zones} />
      <p className="mt-8 text-sm text-black/60">
        Sudah mempunyai akaun? <Link href="/login" className="font-medium text-brand-700 hover:underline">Log masuk</Link>
      </p>
    </AuthShell>
  );
}
