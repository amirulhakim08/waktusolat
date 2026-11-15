import DisplayApp from "@/components/display/DisplayApp";
import { requireMosqueAdmin } from "@/lib/auth";
import { buildDraftPayload } from "@/lib/preview";
import type { PrayerModeKey } from "@/lib/prayer/types";

export const dynamic = "force-dynamic";

/** Full-screen draft preview, embedded by /admin/preview in an iframe. */
export default async function PreviewFrame({ searchParams }: PageProps<"/admin/frame">) {
  const { supabase, mosque } = await requireMosqueAdmin();
  const sp = await searchParams;
  const simulate = sp.simulate === "countdown" || sp.simulate === "solat" ? sp.simulate : null;
  const prayers = ["subuh", "zohor", "asar", "maghrib", "isyak", "jumaat"];
  const prayer = typeof sp.prayer === "string" && prayers.includes(sp.prayer) ? (sp.prayer as PrayerModeKey) : null;
  const payload = await buildDraftPayload(supabase, mosque, {
    playlistId: typeof sp.playlist === "string" ? sp.playlist : null, simulate, prayer,
  });
  return <DisplayApp slug={mosque.slug} initialPayload={payload} preview />;
}
