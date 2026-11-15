export const dynamic = "force-dynamic";

/** Server clock for display drift correction (Vercel servers are NTP-synced). */
export function GET() {
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
