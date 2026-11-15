import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <p className="text-sm font-semibold text-gold-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Halaman tidak dijumpai</h1>
        <p className="mt-2 text-black/60">Sila semak semula alamat yang dimasukkan.</p>
        <Link href="/" className={`${buttonClass()} mt-6`}>Ke laman utama</Link>
      </div>
    </main>
  );
}
