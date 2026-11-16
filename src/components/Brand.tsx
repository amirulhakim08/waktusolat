import Link from "next/link";

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="110" fill="#064e3b" />
      <path d="M300 130a130 130 0 1 0 0 252a110 110 0 1 1 0-252z" fill="#e2bd5f" />
      <path d="M330 200l12 30 32 2-25 20 9 31-28-18-28 18 9-31-25-20 32-2z" fill="#ecd08c" />
    </svg>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 font-semibold tracking-tight text-brand-900">
      <Logo />
      <span className="text-lg">Waktu<span className="text-gold-600">Solat</span></span>
    </Link>
  );
}
