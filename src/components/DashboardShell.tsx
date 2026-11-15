import Link from "next/link";
import { Brand } from "./Brand";
import { NavLinks, type NavItem } from "./NavLinks";
import { logoutAction } from "@/app/login/actions";

export function DashboardShell({ nav, home, roleLabel, userName, banner, children }: {
  nav: NavItem[]; home: string; roleLabel: string; userName: string; banner?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-black/5 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4">
          <Brand href={home} />
        </div>
        <details className="group lg:hidden">
          <summary className="cursor-pointer list-none px-5 pb-3 text-sm font-medium text-brand-800">☰ Menu</summary>
          <div className="px-3 pb-3"><NavLinks items={nav} /></div>
        </details>
        <div className="hidden flex-1 overflow-y-auto px-3 lg:block"><NavLinks items={nav} /></div>
        <div className="hidden border-t border-black/5 px-5 py-4 lg:block">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="text-xs text-black/50">{roleLabel}</p>
          <form action={logoutAction} className="mt-2">
            <button className="text-xs font-medium text-black/55 hover:text-black">Log keluar</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {banner}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
        <footer className="px-8 pb-6 text-xs text-black/40 lg:hidden">
          <form action={logoutAction}><button>Log keluar ({userName})</button></form>
        </footer>
      </div>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="mb-3 inline-block text-sm text-brand-700 hover:underline">← {children}</Link>;
}
