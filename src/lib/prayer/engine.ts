/**
 * Prayer Mode state engine.
 *
 * Pure, deterministic function of (corrected time, official schedule,
 * published Prayer Mode settings, manual overrides). Every display computes
 * its mode independently from these inputs, so a browser refresh, sleep/wake
 * or reconnect always lands in the correct mode with the original end time —
 * nothing is accumulated from client-side intervals.
 *
 * Priority (spec §16.1):
 *   1. valid manual override
 *   2. scheduled Solat Mode
 *   3. scheduled Countdown Mode
 *   4. Normal Mode
 */
import { addDays, isFriday, klDateString, klWallTimeToEpoch, MINUTE } from "../time";
import {
  CONGREGATIONAL_PRAYERS,
  PRAYER_KEYS,
  PRAYER_LABELS,
  type CongregationalPrayer,
  type DaySchedule,
  type DisplayMode,
  type PrayerKey,
  type PrayerModeConfig,
  type PrayerModeEntry,
  type PrayerOverride,
} from "./types";

export interface PrayerWindow {
  prayer: CongregationalPrayer;
  date: string;
  friday: boolean; // Friday (Jumaat) settings applied
  label: string; // "Maghrib", "Jumaat"
  start: number; // official prayer time
  countdownEnd: number; // congregational prayer expected to start
  end: number; // Solat Mode ends
  countdownMessage: string;
  solatMessage: string;
}

export interface DisplayState {
  mode: DisplayMode;
  source: "override" | "schedule" | "none";
  prayer: CongregationalPrayer | "jumaat" | null;
  label: string | null;
  /** Countdown target (congregational start) — set in countdown mode. */
  countdownEndsAt: number | null;
  /** When the current prayer mode returns to normal. */
  endsAt: number | null;
  countdownMessage: string;
  solatMessage: string;
  /** True when today's official schedule is available. */
  scheduleValid: boolean;
}

export interface NextPrayer {
  prayer: PrayerKey;
  label: string;
  at: number;
  date: string;
}

export interface EngineInput {
  now: number;
  schedules: DaySchedule[];
  config: PrayerModeConfig;
  overrides?: PrayerOverride[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A schedule day is usable only if every time is well-formed and ordered. */
export function isValidDay(day: DaySchedule | undefined): day is DaySchedule {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return false;
  let prev = -1;
  for (const k of PRAYER_KEYS) {
    const v = day[k];
    if (typeof v !== "string" || !HHMM.test(v)) return false;
    const mins = Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
    if (mins <= prev) return false;
    prev = mins;
  }
  return true;
}

export function scheduleFor(schedules: DaySchedule[], date: string): DaySchedule | undefined {
  const d = schedules.find((s) => s.date === date);
  return isValidDay(d) ? d : undefined;
}

function clampMinutes(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(180, Math.max(0, v));
}

/** Effective settings for a prayer on a date, applying Friday (Jumaat) rules. */
export function effectiveEntry(
  config: PrayerModeConfig,
  prayer: CongregationalPrayer,
  date: string,
): { entry: PrayerModeEntry | undefined; friday: boolean } {
  const base = config[prayer];
  if (prayer === "zohor" && isFriday(date)) {
    const jumaat = config.jumaat;
    if (jumaat?.enabled) {
      if (jumaat.replaces_zohor !== false) {
        return { entry: { ...jumaat, enabled: true }, friday: true };
      }
      // Friday message only; ordinary Zohor durations and enablement.
      return {
        entry: base && {
          ...base,
          countdown_message: jumaat.countdown_message || base.countdown_message,
          solat_message: jumaat.solat_message || base.solat_message,
        },
        friday: true,
      };
    }
  }
  return { entry: base, friday: false };
}

/** All configured, enabled Prayer Mode windows for the given date. */
export function windowsForDate(schedules: DaySchedule[], config: PrayerModeConfig, date: string): PrayerWindow[] {
  const day = scheduleFor(schedules, date);
  if (!day) return []; // never trigger from missing/unverified data
  const out: PrayerWindow[] = [];
  for (const prayer of CONGREGATIONAL_PRAYERS) {
    const { entry, friday } = effectiveEntry(config, prayer, date);
    if (!entry?.enabled) continue;
    const countdown = clampMinutes(entry.countdown_minutes, 0);
    const solat = clampMinutes(entry.solat_minutes, 0);
    if (countdown + solat <= 0) continue;
    const start = klWallTimeToEpoch(date, day[prayer]);
    out.push({
      prayer,
      date,
      friday,
      label: friday ? PRAYER_LABELS.jumaat : PRAYER_LABELS[prayer],
      start,
      countdownEnd: start + countdown * MINUTE,
      end: start + (countdown + solat) * MINUTE,
      countdownMessage: entry.countdown_message ?? "",
      solatMessage: entry.solat_message ?? "",
    });
  }
  return out;
}

interface OverrideInterval {
  o: PrayerOverride;
  start: number;
  countdownEnd: number | null;
  end: number;
}

function overrideIntervals(overrides: PrayerOverride[] | undefined): OverrideInterval[] {
  const out: OverrideInterval[] = [];
  for (const o of overrides ?? []) {
    const start = Date.parse(o.starts_at);
    const end = Date.parse(o.ends_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    // Defensive cap mirroring the DB constraint: no override lasts > 3h.
    if (end - start > 3 * 60 * MINUTE) continue;
    const cd = o.countdown_ends_at ? Date.parse(o.countdown_ends_at) : null;
    out.push({ o, start, end, countdownEnd: cd !== null && Number.isFinite(cd) ? cd : null });
  }
  return out.sort((a, b) => b.start - a.start);
}

function nearestPrayerLabel(windows: PrayerWindow[], at: number): { prayer: CongregationalPrayer | "jumaat" | null; label: string | null; w?: PrayerWindow } {
  // The scheduled window closest to the override start (within 2 hours).
  let best: PrayerWindow | undefined;
  for (const w of windows) {
    const dist = Math.abs(w.start - at);
    if (dist <= 120 * MINUTE && (!best || dist < Math.abs(best.start - at))) best = w;
  }
  if (!best) return { prayer: null, label: null };
  return { prayer: best.friday ? "jumaat" : best.prayer, label: best.label, w: best };
}

export function computeDisplayState({ now, schedules, config, overrides }: EngineInput): DisplayState {
  const today = klDateString(now);
  const scheduleValid = !!scheduleFor(schedules, today);
  // Include yesterday so windows that cross midnight are honoured.
  const windows = [
    ...windowsForDate(schedules, config, addDays(today, -1)),
    ...windowsForDate(schedules, config, today),
  ];
  const ovs = overrideIntervals(overrides);

  // 1. Manual override (most recent active one wins).
  const active = ovs.find((x) => x.start <= now && now < x.end);
  if (active) {
    const named = active.o.prayer
      ? {
          prayer: active.o.prayer,
          label: PRAYER_LABELS[active.o.prayer],
          w: windows.find((w) => w.prayer === active.o.prayer || (active.o.prayer === "jumaat" && w.friday)),
        }
      : nearestPrayerLabel(windows, active.start);
    const base = {
      source: "override" as const,
      prayer: named.prayer,
      label: named.label,
      countdownMessage: named.w?.countdownMessage ?? "",
      solatMessage: named.w?.solatMessage ?? "",
      scheduleValid,
    };
    if (active.o.kind === "normal") {
      return { ...base, mode: "normal", countdownEndsAt: null, endsAt: active.end };
    }
    if (active.o.kind === "countdown" && active.countdownEnd !== null && now < active.countdownEnd) {
      return { ...base, mode: "countdown", countdownEndsAt: active.countdownEnd, endsAt: active.end };
    }
    return { ...base, mode: "solat", countdownEndsAt: null, endsAt: active.end };
  }

  // A scheduled window that overlapped any override was handled manually:
  // never re-trigger it after the override ends.
  const handled = (w: PrayerWindow) => ovs.some((x) => x.start < w.end && w.start < x.end);

  const live = windows.filter((w) => w.start <= now && now < w.end && !handled(w));
  // 2. Solat beats 3. countdown; ties resolved by earliest start.
  const solat = live.filter((w) => now >= w.countdownEnd).sort((a, b) => a.start - b.start)[0];
  if (solat) {
    return {
      mode: "solat", source: "schedule", prayer: solat.friday ? "jumaat" : solat.prayer, label: solat.label,
      countdownEndsAt: null, endsAt: solat.end,
      countdownMessage: solat.countdownMessage, solatMessage: solat.solatMessage, scheduleValid,
    };
  }
  const countdown = live.sort((a, b) => a.start - b.start)[0];
  if (countdown) {
    return {
      mode: "countdown", source: "schedule", prayer: countdown.friday ? "jumaat" : countdown.prayer, label: countdown.label,
      countdownEndsAt: countdown.countdownEnd, endsAt: countdown.end,
      countdownMessage: countdown.countdownMessage, solatMessage: countdown.solatMessage, scheduleValid,
    };
  }

  return {
    mode: "normal", source: "none", prayer: null, label: null, countdownEndsAt: null, endsAt: null,
    countdownMessage: "", solatMessage: "", scheduleValid,
  };
}

/** Upcoming prayer time (any of the six), today or tomorrow. */
export function nextPrayer(now: number, schedules: DaySchedule[]): NextPrayer | null {
  const today = klDateString(now);
  for (const date of [today, addDays(today, 1)]) {
    const day = scheduleFor(schedules, date);
    if (!day) continue;
    for (const p of PRAYER_KEYS) {
      const at = klWallTimeToEpoch(date, day[p]);
      if (at > now) {
        const label = p === "zohor" && isFriday(date) ? PRAYER_LABELS.jumaat : PRAYER_LABELS[p];
        return { prayer: p, label, at, date };
      }
    }
    if (date === today && !day) break;
  }
  return null;
}

/** Most recent prayer whose time has passed today (for "current" highlighting). */
export function currentPrayer(now: number, schedules: DaySchedule[]): PrayerKey | null {
  const today = klDateString(now);
  const day = scheduleFor(schedules, today);
  if (!day) return null;
  let cur: PrayerKey | null = null;
  for (const p of PRAYER_KEYS) if (klWallTimeToEpoch(today, day[p]) <= now) cur = p;
  return cur;
}
