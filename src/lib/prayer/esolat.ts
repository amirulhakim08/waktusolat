/**
 * JAKIM e-Solat integration (official Malaysian prayer times).
 *
 * Endpoint (public, no key):
 *   GET  https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat&period=<today|week|month|year>&zone=<ZONE>
 *   POST same URL with period=duration and form fields datestart / dateend (YYYY-MM-DD)
 *
 * Documented response shape:
 *   { "prayerTime": [ { "hijri": "1448-05-25", "date": "15-Nov-2026", "day": "Sunday",
 *       "imsak": "05:41:00", "fajr": "05:51:00", "syuruk": "06:59:00", "dhuhr": "12:59:00",
 *       "asr": "16:22:00", "maghrib": "18:56:00", "isha": "20:10:00" } ],
 *     "status": "OK!", "serverTime": "...", "periodType": "...", "lang": "ms_my", "zone": "SGR01" }
 *
 * The parser is strict: anything that does not match is rejected rather than
 * "repaired", so the system never shows unverified prayer times.
 */
import { z } from "zod";
import { isValidDay } from "./engine";
import type { DaySchedule } from "./types";

export const ESOLAT_BASE = "https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat";
export const ZONE_RE = /^[A-Z]{3}\d{2}$/;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  // Malay abbreviations, defensively
  mac: "03", mei: "05", ogo: "08", okt: "10", dis: "12",
};

/** "15-Nov-2026" | "2026-11-15" -> "2026-11-15" (or null). */
export function parseEsolatDate(input: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (iso) return input;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(input.trim());
  if (!m) return null;
  const mo = MONTHS[m[2].toLowerCase()];
  if (!mo) return null;
  const day = m[1].padStart(2, "0");
  const out = `${m[3]}-${mo}-${day}`;
  const d = new Date(`${out}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== out ? null : out;
}

/** "05:51:00" | "05:51" -> "05:51" (or null). */
export function parseEsolatTime(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(input.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

const entrySchema = z.object({
  hijri: z.string().optional().nullable(),
  date: z.string(),
  imsak: z.string().optional().nullable(),
  fajr: z.string(),
  syuruk: z.string(),
  dhuhr: z.string(),
  asr: z.string(),
  maghrib: z.string(),
  isha: z.string(),
});

const responseSchema = z.object({
  prayerTime: z.array(z.unknown()),
  status: z.string(),
  zone: z.string().optional(),
});

export interface ParsedSchedule extends DaySchedule {
  imsak: string | null;
}

export interface ParseResult {
  days: ParsedSchedule[];
  rejected: number;
}

export class EsolatError extends Error {}

export function parseEsolatResponse(json: unknown, zone: string): ParseResult {
  const res = responseSchema.safeParse(json);
  if (!res.success) throw new EsolatError("Format respons e-Solat tidak dikenali");
  if (!/^OK/i.test(res.data.status)) throw new EsolatError(`e-Solat status: ${res.data.status}`);
  if (res.data.zone && res.data.zone.toUpperCase() !== zone) {
    throw new EsolatError(`Zon tidak sepadan (${res.data.zone} ≠ ${zone})`);
  }
  const days: ParsedSchedule[] = [];
  let rejected = 0;
  for (const raw of res.data.prayerTime) {
    const e = entrySchema.safeParse(raw);
    if (!e.success) { rejected++; continue; }
    const date = parseEsolatDate(e.data.date);
    const hijri = e.data.hijri && /^\d{4}-\d{2}-\d{2}$/.test(e.data.hijri) ? e.data.hijri : null;
    const day: ParsedSchedule = {
      date: date ?? "",
      hijri,
      imsak: parseEsolatTime(e.data.imsak),
      subuh: parseEsolatTime(e.data.fajr) ?? "",
      syuruk: parseEsolatTime(e.data.syuruk) ?? "",
      zohor: parseEsolatTime(e.data.dhuhr) ?? "",
      asar: parseEsolatTime(e.data.asr) ?? "",
      maghrib: parseEsolatTime(e.data.maghrib) ?? "",
      isyak: parseEsolatTime(e.data.isha) ?? "",
    };
    if (!date || !isValidDay(day) || !plausibleForMalaysia(day)) { rejected++; continue; }
    days.push(day);
  }
  return { days, rejected };
}

/** Sanity bounds for Malaysian latitudes — catches corrupt/misaligned data. */
function plausibleForMalaysia(d: DaySchedule): boolean {
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return (
    mins(d.subuh) >= 4 * 60 + 30 && mins(d.subuh) <= 6 * 60 + 30 &&
    mins(d.zohor) >= 12 * 60 && mins(d.zohor) <= 13 * 60 + 45 &&
    mins(d.maghrib) >= 18 * 60 && mins(d.maghrib) <= 19 * 60 + 45 &&
    mins(d.isyak) >= 19 * 60 + 10 && mins(d.isyak) <= 21 * 60
  );
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function request(url: string, init: RequestInit, opts: FetchOptions): Promise<unknown> {
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await f(url, { ...init, signal: ctrl.signal, cache: "no-store", headers: { Accept: "application/json", ...(init.headers ?? {}) } });
    if (!res.ok) throw new EsolatError(`e-Solat HTTP ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new EsolatError("e-Solat tidak memulangkan JSON");
    }
  } finally {
    clearTimeout(t);
  }
}

/** Fetch an explicit date range (preferred), falling back to the current month. */
export async function fetchZoneSchedule(zone: string, start: string, end: string, opts: FetchOptions = {}): Promise<{ result: ParseResult; url: string }> {
  if (!ZONE_RE.test(zone)) throw new EsolatError("Kod zon tidak sah");
  const durationUrl = `${ESOLAT_BASE}&period=duration&zone=${zone}`;
  try {
    const body = new URLSearchParams({ datestart: start, dateend: end });
    const json = await request(durationUrl, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }, opts);
    const result = parseEsolatResponse(json, zone);
    if (result.days.length > 0) return { result, url: durationUrl };
  } catch (e) {
    if (!(e instanceof EsolatError) && !(e instanceof Error)) throw e;
  }
  const monthUrl = `${ESOLAT_BASE}&period=month&zone=${zone}`;
  const json = await request(monthUrl, { method: "GET" }, opts);
  return { result: parseEsolatResponse(json, zone), url: monthUrl };
}
