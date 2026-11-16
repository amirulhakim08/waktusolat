/** Keep in sync with public.is_reserved_slug() in the database migration. */
export const RESERVED_SLUGS = [
  "admin", "master", "login", "logout", "register", "api", "auth", "permohonan",
  "_next", "static", "public", "offline", "manifest", "sw", "favicon", "icons",
  "robots", "sitemap", "help", "bantuan", "about", "settings", "display", "media",
  "assets", "www", "app", "dashboard", "account", "akaun", "privacy", "terms",
  "status", "preview", "null", "undefined",
] as const;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug.toLowerCase());
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length >= 3 && slug.length <= 60 && !isReservedSlug(slug);
}

/** "Surau Al-Amin (Taman Melati)" -> "surau-al-amin-taman-melati" */
export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  if (base.length < 3) return `masjid-${base || "baru"}`.slice(0, 60);
  return isReservedSlug(base) ? `${base}-masjid` : base;
}

/** Picks the first free variant: base, base-2, base-3… */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const b = isValidSlug(base) ? base : slugify(base);
  if (!taken.has(b)) return b;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${b.slice(0, 60 - String(i).length - 1)}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Tidak dapat menjana slug unik");
}
