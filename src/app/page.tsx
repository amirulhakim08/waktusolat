import Link from "next/link";
import { Brand } from "@/components/Brand";
import { buttonClass } from "@/components/ui";

const features = [
  ["Waktu solat rasmi JAKIM", "Mengikut zon e-Solat masjid anda, dikemas kini secara automatik dan disahkan sebelum dipaparkan."],
  ["Countdown & Mod Solat automatik", "Apabila masuk waktu, slaid berhenti dan countdown iqamah dipaparkan, diikuti skrin tenang semasa solat."],
  ["Slaid poster & video", "Muat naik poster kuliah dan pengumuman. Setiap gambar boleh mempunyai tempoh dan kesan pertukaran sendiri."],
  ["Hanya pelayar web", "Buka pautan masjid di Android TV, Raspberry Pi, komputer atau tablet. Tiada aplikasi perlu dipasang."],
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-[#f6f7f5]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
        <nav className="flex gap-2">
          <Link href="/login" className={buttonClass("ghost")}>Log Masuk</Link>
          <Link href="/register" className={buttonClass("primary")}>Daftar Masjid</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-gold-600">Papan tanda digital masjid & surau</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-brand-950 sm:text-5xl">
              Paparan waktu solat yang tenang, tepat dan mudah diurus.
            </h1>
            <p className="mt-5 text-lg text-black/65">
              WaktuSolat memaparkan waktu solat rasmi, slaid pengumuman dan countdown solat berjemaah di skrin TV masjid —
              lalu beralih secara automatik ke Mod Solat tanpa gangguan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonClass("primary")}>Mohon akaun masjid</Link>
              <Link href="/login" className={buttonClass("secondary")}>Log masuk pentadbir</Link>
            </div>
          </div>
          <div className="rounded-3xl bg-brand-950 p-4 shadow-2xl ring-1 ring-gold-500/30">
            <div className="aspect-video rounded-2xl bg-gradient-to-b from-brand-900 to-brand-950 p-4 text-white">
              <div className="flex items-center justify-between">
                <p className="font-bold text-gold-300">Surau Al-Amin</p>
                <p className="text-2xl font-bold tabular-nums">19:12</p>
              </div>
              <div className="mt-3 flex h-[52%] items-center justify-center rounded-xl bg-black/30 text-sm text-white/60 ring-1 ring-gold-500/20">
                Slaid poster & pengumuman
              </div>
              <div className="mt-3 grid grid-cols-6 gap-1.5 text-center text-[10px]">
                {["Subuh", "Syuruk", "Zohor", "Asar", "Maghrib", "Isyak"].map((p) => (
                  <div key={p} className={`rounded-md py-1.5 ${p === "Maghrib" ? "bg-gold-500 text-brand-950" : "bg-white/10"}`}>{p}</div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="mt-20 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(([t, d]) => (
            <div key={t} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <h2 className="font-semibold text-brand-900">{t}</h2>
              <p className="mt-2 text-sm text-black/60">{d}</p>
            </div>
          ))}
        </section>
        <section className="mt-16 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold text-brand-900">Cara bermula</h2>
          <ol className="mt-3 grid gap-3 text-sm text-black/70 sm:grid-cols-4">
            <li><b>1.</b> Wakil masjid mendaftar dan mengesahkan e-mel.</li>
            <li><b>2.</b> Pentadbir sistem menyemak dan meluluskan permohonan.</li>
            <li><b>3.</b> Muat naik poster, susun playlist dan tetapkan Mod Solat.</li>
            <li><b>4.</b> Buka pautan masjid (cth. <code>/surau-al-amin</code>) di TV.</li>
          </ol>
        </section>
      </main>
      <footer className="border-t border-black/5 py-6 text-center text-xs text-black/50">
        Waktu solat bersumberkan data rasmi JAKIM (e-Solat). © WaktuSolat
      </footer>
    </div>
  );
}
