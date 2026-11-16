/**
 * Manual prayer times (for locations without a suitable JAKIM zone, e.g.
 * offshore platforms). Pure helpers shared by the admin UI and server
 * actions; the database re-validates ordering with a CHECK constraint.
 */
import { addDays } from "../time";
import { isValidDay } from "./engine";
import { PRAYER_KEYS, type DaySchedule, type PrayerKey } from "./types";

export type ManualTimes = Record<PrayerKey, string>;
export interface ManualRow extends ManualTimes { date: string }

export const MAX_MANUAL_DAYS = 366;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-17" | "17/11/2026" | "17-11-2026" -> "2026-11-17" (or null). */
export function normaliseDate(input: string): string | null {
  const s = input.trim();
  let iso: string | null = null;
  if (ISO.test(s)) iso = s;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** "5:40" | "05:40" | "05:40:00" -> "05:40" (or null). */
export function normaliseTime(input: string): string | null {
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(input.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function validateTimes(times: Partial<Record<PrayerKey, string>>): { ok: true; times: ManualTimes } | { ok: false; error: string } {
  const out = {} as ManualTimes;
  for (const k of PRAYER_KEYS) {
    const t = normaliseTime(times[k] ?? "");
    if (!t) return { ok: false, error: `Waktu ${k} tidak sah (format JJ:MM, cth. 05:45).` };
    out[k] = t;
  }
  if (!isValidDay({ date: "2000-01-01", hijri: null, ...out })) {
    return { ok: false, error: "Waktu mesti mengikut urutan: Subuh < Syuruk < Zohor < Asar < Maghrib < Isyak." };
  }
  return { ok: true, times: out };
}

/** Same times for every date from..to (inclusive). */
export function expandRange(from: string, to: string, times: ManualTimes): { ok: true; rows: ManualRow[] } | { ok: false; error: string } {
  const a = normaliseDate(from);
  const b = normaliseDate(to);
  if (!a || !b) return { ok: false, error: "Tarikh tidak sah." };
  if (b < a) return { ok: false, error: "Tarikh akhir mesti selepas tarikh mula." };
  const rows: ManualRow[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) {
    rows.push({ date: d, ...times });
    if (rows.length > MAX_MANUAL_DAYS) return { ok: false, error: `Maksimum ${MAX_MANUAL_DAYS} hari setiap kali.` };
  }
  return { ok: true, rows };
}

/**
 * Parses pasted rows (CSV / spreadsheet copy):
 *   tarikh, subuh, syuruk, zohor, asar, maghrib, isyak
 * Separators: comma, semicolon or tab. A header line is ignored.
 */
export function parseManualCsv(text: string): { rows: ManualRow[]; errors: string[] } {
  const rows: ManualRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cells = line.split(/[,;\t]/).map((c) => c.trim()).filter((c) => c !== "");
    if (i === 0 && cells[0] && !normaliseDate(cells[0]) && /[a-z]/i.test(cells[0])) return; // header
    if (cells.length < 7) {
      errors.push(`Baris ${i + 1}: perlu 7 lajur (tarikh + 6 waktu).`);
      return;
    }
    const date = normaliseDate(cells[0]);
    if (!date) {
      errors.push(`Baris ${i + 1}: tarikh "${cells[0]}" tidak sah.`);
      return;
    }
    const v = validateTimes(Object.fromEntries(PRAYER_KEYS.map((k, j) => [k, cells[j + 1]])));
    if (!v.ok) {
      errors.push(`Baris ${i + 1} (${date}): ${v.error}`);
      return;
    }
    if (seen.has(date)) {
      errors.push(`Baris ${i + 1}: tarikh ${date} berulang.`);
      return;
    }
    seen.add(date);
    rows.push({ date, ...v.times });
  });
  if (rows.length > MAX_MANUAL_DAYS) errors.push(`Maksimum ${MAX_MANUAL_DAYS} baris setiap kali.`);
  return { rows, errors };
}

export function toDaySchedule(r: ManualRow, hijri: string | null = null): DaySchedule {
  return { ...r, hijri, source: "manual" };
}
