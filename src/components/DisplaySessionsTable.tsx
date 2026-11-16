import { Badge, Table, td, th } from "./ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import { DISPLAY_ONLINE_MS } from "@/lib/constants";

export interface SessionRow {
  id: string; mode: string | null; playlist_version: number | null; schedule_ok: boolean | null; screen: string | null;
  user_agent: string | null; last_heartbeat_at: string; last_sync_at: string | null; first_seen_at: string;
  mosque?: { name: string; slug: string } | null;
}

const MODE = { normal: "Biasa", countdown: "Countdown", solat: "Mod Solat" } as Record<string, string>;

export function DisplaySessionsTable({ rows, showMosque, now }: { rows: SessionRow[]; showMosque?: boolean; now: number }) {
  return (
    <Table>
      <thead><tr>{showMosque && <th className={th}>Masjid</th>}<th className={th}>Status</th><th className={th}>Heartbeat</th><th className={th}>Mod</th><th className={th}>Playlist</th><th className={th}>Waktu solat</th><th className={th}>Penyegerakan</th><th className={th}>Peranti</th></tr></thead>
      <tbody className="divide-y divide-black/5">
        {rows.map((s) => {
          const online = now - Date.parse(s.last_heartbeat_at) < DISPLAY_ONLINE_MS;
          return (
            <tr key={s.id}>
              {showMosque && <td className={td}>{s.mosque?.name}<br /><a className="text-xs text-brand-700" href={`/${s.mosque?.slug}`} target="_blank">/{s.mosque?.slug}</a></td>}
              <td className={td}><Badge tone={online ? "green" : "gray"}>{online ? "Dalam talian" : "Luar talian"}</Badge></td>
              <td className={td}>{timeAgo(s.last_heartbeat_at, now)}</td>
              <td className={td}>{s.mode ? MODE[s.mode] ?? s.mode : "—"}</td>
              <td className={td}>{s.playlist_version ? `v${s.playlist_version}` : "—"}</td>
              <td className={td}>{s.schedule_ok === false ? <Badge tone="red">Tidak sah</Badge> : <Badge tone="green">Sah</Badge>}</td>
              <td className={td}>{formatDateTime(s.last_sync_at)}</td>
              <td className={`${td} max-w-xs text-xs text-black/60`}><span className="block truncate" title={s.user_agent ?? ""}>{s.screen} · {s.user_agent}</span></td>
            </tr>
          );
        })}
        {rows.length === 0 && <tr><td className={td} colSpan={8}>Tiada sesi paparan direkodkan.</td></tr>}
      </tbody>
    </Table>
  );
}
