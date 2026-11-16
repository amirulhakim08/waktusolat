import { DashboardShell } from "@/components/DashboardShell";
import { requireMosqueAdmin } from "@/lib/auth";
import { stopActingAction } from "@/app/master/actions";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Papan Pemuka" },
  { href: "/admin/profile", label: "Profil Masjid" },
  { href: "/admin/prayer-times", label: "Waktu Solat" },
  { href: "/admin/media", label: "Pustaka Media" },
  { href: "/admin/playlist", label: "Pengurus Playlist" },
  { href: "/admin/display-settings", label: "Tetapan Paparan" },
  { href: "/admin/prayer-mode", label: "Mod Solat" },
  { href: "/admin/preview", label: "Pratonton Paparan" },
  { href: "/admin/storage", label: "Penggunaan Storan" },
  { href: "/admin/displays", label: "Pemantauan Paparan" },
  { href: "/admin/history", label: "Sejarah Penerbitan" },
  { href: "/admin/account", label: "Tetapan Akaun" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, mosque, actingAsMaster } = await requireMosqueAdmin();
  const banner = actingAsMaster ? (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-gold-100 px-6 py-2 text-sm text-brand-950">
      <span>Anda menguruskan <b>{mosque.name}</b> sebagai Master Super Admin.</span>
      <form action={stopActingAction}><button className="font-semibold underline">Kembali ke Master</button></form>
    </div>
  ) : null;
  return (
    <DashboardShell nav={NAV} home="/admin" roleLabel={actingAsMaster ? "Master (urus masjid)" : `Pentadbir · ${mosque.name}`}
      userName={profile.full_name || profile.email} banner={banner}>
      {children}
    </DashboardShell>
  );
}
