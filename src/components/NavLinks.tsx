"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string; badge?: number }

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const root = item.href === "/admin" || item.href === "/master";
        const active = root ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
              active ? "bg-brand-50 font-semibold text-brand-800" : "text-black/70 hover:bg-black/[.03] hover:text-black"}`}>
            {item.label}
            {!!item.badge && <span className="rounded-full bg-gold-500 px-2 text-xs font-semibold text-brand-950">{item.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
