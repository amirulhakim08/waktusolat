import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/ui";
import { getSession, homeFor } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log Masuk" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const { profile } = await getSession();
  if (profile) redirect(await homeFor(profile));
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <AuthShell title="Log masuk pentadbir" subtitle="Untuk Master Super Admin dan pentadbir masjid/surau.">
      {sp.verified && <div className="mb-4"><Alert tone="success">E-mel anda telah disahkan. Sila log masuk.</Alert></div>}
      <LoginForm next={next} />
      <p className="mt-6 text-center text-sm text-black/60">
        Belum mempunyai akaun? <Link href="/register" className="font-medium text-brand-700 hover:underline">Daftar masjid/surau</Link>
      </p>
    </AuthShell>
  );
}
