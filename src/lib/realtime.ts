import "server-only";
import { publicEnv } from "./env";

export const displayChannel = (mosqueId: string) => `display:${mosqueId}`;

/**
 * Sends a tiny "something changed" broadcast to every display of a mosque.
 * Displays react by re-fetching their published payload; no content is
 * pushed through the channel. Failures are non-fatal (displays also poll).
 */
export async function broadcastDisplayUpdate(mosqueId: string, reason: "publish" | "override" | "settings") {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { supabaseUrl } = publicEnv();
  if (!key || !supabaseUrl) return;
  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ topic: displayChannel(mosqueId), event: "update", payload: { reason, at: Date.now() }, private: false }],
      }),
      cache: "no-store",
    });
    if (!res.ok) console.error("[realtime] broadcast failed", res.status);
  } catch (e) {
    console.error("[realtime] broadcast error", e);
  }
}
