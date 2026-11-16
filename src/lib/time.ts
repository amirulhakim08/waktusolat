/**
 * Time helpers for Asia/Kuala_Lumpur.
 *
 * Malaysia uses UTC+08:00 all year (no daylight saving), so converting a
 * KL wall-clock time to an absolute instant is a fixed offset. This keeps
 * the prayer engine deterministic and cheap on low-power TV browsers.
 * Formatting for humans still uses Intl with the IANA zone name.
 */
export const MALAYSIA_TZ = "Asia/Kuala_Lumpur";
export const KL_OFFSET_MS = 8 * 60 * 60 * 1000;
export const MINUTE = 60_000;
export const DAY_MS = 24 * 60 * MINUTE;

/** YYYY-MM-DD for the given instant, in Kuala Lumpur. */
export function klDateString(epochMs: number): string {
  return new Date(epochMs + KL_OFFSET_MS).toISOString().slice(0, 10);
}

/** Absolute instant for a KL wall-clock date + "HH:MM" (or "HH:MM:SS"). */
export function klWallTimeToEpoch(date: string, hhmm: string): number {
  const [h, m, s = "0"] = hhmm.split(":");
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y, mo - 1, d, Number(h), Number(m), Number(s)) - KL_OFFSET_MS;
}

export function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday … 5 = Friday, for a YYYY-MM-DD calendar date. */
export function dayOfWeek(date: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function isFriday(date: string): boolean {
  return dayOfWeek(date) === 5;
}

const MALAY_DAYS = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
const MALAY_MONTHS = [
  "Januari", "Februari", "Mac", "April", "Mei", "Jun",
  "Julai", "Ogos", "September", "Oktober", "November", "Disember",
];
export const HIJRI_MONTHS = [
  "Muharram", "Safar", "Rabiulawal", "Rabiulakhir", "Jamadilawal", "Jamadilakhir",
  "Rejab", "Syaaban", "Ramadan", "Syawal", "Zulkaedah", "Zulhijjah",
];

export function malayDayName(date: string): string {
  return MALAY_DAYS[dayOfWeek(date)];
}

/** "15 November 2026" */
export function formatMalayDate(date: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  return `${d} ${MALAY_MONTHS[mo - 1]} ${y}`;
}

/** Official Hijri date from e-Solat ("1448-05-25") -> "25 Jamadilawal 1448H". */
export function formatHijri(hijri: string | null | undefined): string | null {
  if (!hijri) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hijri);
  if (!m) return null;
  const month = HIJRI_MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}H`;
}

/** KL wall clock parts for an instant (no Intl needed — fixed offset). */
export function klClock(epochMs: number) {
  const d = new Date(epochMs + KL_OFFSET_MS);
  return { hours: d.getUTCHours(), minutes: d.getUTCMinutes(), seconds: d.getUTCSeconds() };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatClock(epochMs: number, format: "24h" | "12h", withSeconds: boolean): { time: string; suffix: string } {
  const { hours, minutes, seconds } = klClock(epochMs);
  let h = hours;
  let suffix = "";
  if (format === "12h") {
    suffix = hours < 12 ? "PG" : "PTG";
    h = hours % 12 === 0 ? 12 : hours % 12;
  }
  const time = `${format === "12h" ? h : pad(h)}:${pad(minutes)}${withSeconds ? `:${pad(seconds)}` : ""}`;
  return { time, suffix };
}

/** "HH:MM" (24h) -> display string in the requested format. */
export function formatHHMM(hhmm: string, format: "24h" | "12h"): string {
  if (format === "24h") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad(m)} ${h < 12 ? "PG" : "PTG"}`;
}

/** mm:ss or h:mm:ss for a non-negative duration. Rounds UP so 0 is shown only at the end. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Current instant (wrapper keeps render-time calls explicit in server components). */
export const nowMs = (): number => Date.now();
