import { describe, expect, it } from "vitest";
import { computeDisplayState, nextPrayer, windowsForDate, isValidDay } from "@/lib/prayer/engine";
import type { DaySchedule, PrayerModeConfig, PrayerOverride } from "@/lib/prayer/types";
import { klWallTimeToEpoch, MINUTE } from "@/lib/time";

// 2026-11-16 is a Monday; 2026-11-20 is a Friday.
const day = (date: string, over: Partial<DaySchedule> = {}): DaySchedule => ({
  date, hijri: "1448-05-26", subuh: "05:50", syuruk: "06:59", zohor: "12:59",
  asar: "16:22", maghrib: "19:12", isyak: "20:25", ...over,
});
const schedules = [day("2026-11-15"), day("2026-11-16"), day("2026-11-17"), day("2026-11-19"), day("2026-11-20")];
const config: PrayerModeConfig = {
  subuh: { enabled: true, countdown_minutes: 15, solat_minutes: 5 },
  zohor: { enabled: true, countdown_minutes: 10, solat_minutes: 5 },
  asar: { enabled: true, countdown_minutes: 10, solat_minutes: 5 },
  maghrib: { enabled: true, countdown_minutes: 5, solat_minutes: 5, solat_message: "Matikan telefon" },
  isyak: { enabled: true, countdown_minutes: 15, solat_minutes: 5 },
  jumaat: { enabled: false, countdown_minutes: 30, solat_minutes: 15, replaces_zohor: true },
};
const at = (date: string, hhmmss: string) => klWallTimeToEpoch(date, hhmmss);
const state = (now: number, extra: Partial<Parameters<typeof computeDisplayState>[0]> = {}) =>
  computeDisplayState({ now, schedules, config, ...extra });

describe("prayer mode engine — Maghrib acceptance scenario (7:12 / 5 + 5)", () => {
  const D = "2026-11-16";
  it("is normal before prayer time", () => {
    expect(state(at(D, "19:11:59")).mode).toBe("normal");
  });
  it("starts countdown exactly at official time with 05:00 remaining", () => {
    const s = state(at(D, "19:12:00"));
    expect(s).toMatchObject({ mode: "countdown", prayer: "maghrib", label: "Maghrib", source: "schedule" });
    expect(s.countdownEndsAt! - at(D, "19:12:00")).toBe(5 * MINUTE);
  });
  it("restores remaining time after a refresh at 7:15 (no restart)", () => {
    const now = at(D, "19:15:00");
    const s = state(now);
    expect(s.mode).toBe("countdown");
    expect(s.countdownEndsAt! - now).toBe(2 * MINUTE);
  });
  it("switches to Solat Mode at 7:17 and keeps original end time on refresh", () => {
    expect(state(at(D, "19:16:59")).mode).toBe("countdown");
    const s = state(at(D, "19:17:00"));
    expect(s).toMatchObject({ mode: "solat", solatMessage: "Matikan telefon" });
    expect(s.endsAt).toBe(at(D, "19:22:00"));
    expect(state(at(D, "19:20:30")).endsAt).toBe(at(D, "19:22:00"));
  });
  it("returns to normal at 7:22 and never re-triggers afterwards", () => {
    expect(state(at(D, "19:21:59")).mode).toBe("solat");
    expect(state(at(D, "19:22:00")).mode).toBe("normal");
    expect(state(at(D, "19:40:00")).mode).toBe("normal");
  });
});

describe("prayer mode engine — configuration", () => {
  const D = "2026-11-16";
  it("uses different durations per prayer", () => {
    expect(state(at(D, "05:50:00")).countdownEndsAt).toBe(at(D, "06:05:00"));
    expect(state(at(D, "12:59:00")).countdownEndsAt).toBe(at(D, "13:09:00"));
    expect(state(at(D, "20:25:00")).countdownEndsAt).toBe(at(D, "20:40:00"));
  });
  it("never triggers for Syuruk", () => {
    expect(state(at(D, "06:59:30")).mode).toBe("normal");
    const ws = windowsForDate(schedules, config, D).map((w) => w.prayer);
    expect(ws).not.toContain("syuruk" as never);
  });
  it("respects a disabled prayer", () => {
    const cfg = { ...config, asar: { ...config.asar!, enabled: false } };
    expect(computeDisplayState({ now: at(D, "16:25:00"), schedules, config: cfg }).mode).toBe("normal");
  });
  it("two mosques with different configs compute independently", () => {
    const other = { ...config, maghrib: { enabled: true, countdown_minutes: 10, solat_minutes: 7 } };
    const now = at(D, "19:18:00");
    expect(computeDisplayState({ now, schedules, config }).mode).toBe("solat");
    expect(computeDisplayState({ now, schedules, config: other }).mode).toBe("countdown");
  });
});

describe("prayer mode engine — Friday", () => {
  const F = "2026-11-20";
  it("uses ordinary Zohor when Friday settings are disabled", () => {
    const s = state(at(F, "13:05:00"));
    expect(s).toMatchObject({ mode: "countdown", label: "Zohor", prayer: "zohor" });
  });
  it("Friday settings replace Zohor when enabled", () => {
    const cfg = { ...config, jumaat: { enabled: true, countdown_minutes: 30, solat_minutes: 15, replaces_zohor: true, countdown_message: "Khutbah Jumaat" } };
    const s = computeDisplayState({ now: at(F, "13:20:00"), schedules, config: cfg });
    expect(s).toMatchObject({ mode: "countdown", label: "Jumaat", prayer: "jumaat", countdownMessage: "Khutbah Jumaat" });
    expect(s.countdownEndsAt).toBe(at(F, "13:29:00"));
    expect(computeDisplayState({ now: at(F, "13:40:00"), schedules, config: cfg }).mode).toBe("solat");
    expect(computeDisplayState({ now: at(F, "13:44:00"), schedules, config: cfg }).mode).toBe("normal");
  });
  it("Friday settings do not affect other days", () => {
    const cfg = { ...config, jumaat: { enabled: true, countdown_minutes: 30, solat_minutes: 15, replaces_zohor: true } };
    const s = computeDisplayState({ now: at("2026-11-19", "13:05:00"), schedules, config: cfg });
    expect(s.label).toBe("Zohor");
    expect(s.countdownEndsAt).toBe(at("2026-11-19", "13:09:00"));
  });
  it("replaces_zohor=false keeps Zohor durations but uses the Friday label/message", () => {
    const cfg = { ...config, jumaat: { enabled: true, countdown_minutes: 30, solat_minutes: 15, replaces_zohor: false, solat_message: "Solat Jumaat" } };
    const s = computeDisplayState({ now: at(F, "13:10:00"), schedules, config: cfg });
    expect(s).toMatchObject({ mode: "solat", label: "Jumaat", solatMessage: "Solat Jumaat" });
  });
});

describe("prayer mode engine — data validity", () => {
  it("does not trigger without today's verified schedule", () => {
    const s = computeDisplayState({ now: at("2026-11-18", "19:13:00"), schedules, config });
    expect(s.mode).toBe("normal");
    expect(s.scheduleValid).toBe(false);
  });
  it("rejects malformed or out-of-order days", () => {
    expect(isValidDay(day("2026-11-16", { asar: "25:00" }))).toBe(false);
    expect(isValidDay(day("2026-11-16", { maghrib: "16:00" }))).toBe(false);
    const bad = [day("2026-11-16", { maghrib: "abc" })];
    expect(computeDisplayState({ now: at("2026-11-16", "19:13:00"), schedules: bad, config }).mode).toBe("normal");
  });
  it("handles windows that cross midnight using yesterday's schedule", () => {
    const late = [day("2026-11-16", { isyak: "23:55" }), day("2026-11-17")];
    const cfg = { ...config, isyak: { enabled: true, countdown_minutes: 10, solat_minutes: 5 } };
    const s = computeDisplayState({ now: at("2026-11-17", "00:07:00"), schedules: late, config: cfg });
    expect(s).toMatchObject({ mode: "solat", prayer: "isyak" });
    expect(s.endsAt).toBe(at("2026-11-17", "00:10:00"));
  });
});

describe("prayer mode engine — manual overrides", () => {
  const D = "2026-11-16";
  const iso = (ms: number) => new Date(ms).toISOString();
  it("Start Solat Now overrides countdown immediately", () => {
    const o: PrayerOverride = { kind: "solat", prayer: "maghrib", starts_at: iso(at(D, "19:14:00")), countdown_ends_at: null, ends_at: iso(at(D, "19:21:00")) };
    expect(state(at(D, "19:14:30"), { overrides: [o] })).toMatchObject({ mode: "solat", source: "override", endsAt: at(D, "19:21:00") });
  });
  it("does not re-trigger the scheduled window after the override ends", () => {
    const o: PrayerOverride = { kind: "solat", prayer: "maghrib", starts_at: iso(at(D, "19:14:00")), countdown_ends_at: null, ends_at: iso(at(D, "19:19:00")) };
    expect(state(at(D, "19:19:30"), { overrides: [o] }).mode).toBe("normal");
  });
  it("extends a countdown when prayer starts later", () => {
    const o: PrayerOverride = { kind: "countdown", prayer: "maghrib", starts_at: iso(at(D, "19:16:00")), countdown_ends_at: iso(at(D, "19:21:00")), ends_at: iso(at(D, "19:26:00")) };
    expect(state(at(D, "19:18:00"), { overrides: [o] })).toMatchObject({ mode: "countdown", countdownEndsAt: at(D, "19:21:00") });
    expect(state(at(D, "19:22:00"), { overrides: [o] }).mode).toBe("solat");
    expect(state(at(D, "19:26:00"), { overrides: [o] }).mode).toBe("normal");
  });
  it("End Prayer Mode forces normal", () => {
    const o: PrayerOverride = { kind: "normal", prayer: null, starts_at: iso(at(D, "19:13:00")), countdown_ends_at: null, ends_at: iso(at(D, "19:43:00")) };
    expect(state(at(D, "19:18:00"), { overrides: [o] })).toMatchObject({ mode: "normal", source: "override" });
  });
  it("ignores overrides longer than 3 hours (stale)", () => {
    const o: PrayerOverride = { kind: "solat", prayer: null, starts_at: iso(at(D, "10:00:00")), countdown_ends_at: null, ends_at: iso(at(D, "18:00:00")) };
    expect(state(at(D, "11:00:00"), { overrides: [o] }).mode).toBe("normal");
  });
  it("an expired override does not affect later prayers", () => {
    const o: PrayerOverride = { kind: "solat", prayer: "asar", starts_at: iso(at(D, "16:20:00")), countdown_ends_at: null, ends_at: iso(at(D, "16:30:00")) };
    expect(state(at(D, "19:13:00"), { overrides: [o] }).mode).toBe("countdown");
  });
  it("labels an unnamed override with the nearest prayer", () => {
    const o: PrayerOverride = { kind: "countdown", prayer: null, starts_at: iso(at(D, "19:05:00")), countdown_ends_at: iso(at(D, "19:10:00")), ends_at: iso(at(D, "19:15:00")) };
    expect(state(at(D, "19:06:00"), { overrides: [o] }).label).toBe("Maghrib");
  });
});

describe("next prayer", () => {
  it("returns the next of the six, rolling to tomorrow after Isyak", () => {
    expect(nextPrayer(at("2026-11-16", "13:30:00"), schedules)).toMatchObject({ prayer: "asar" });
    expect(nextPrayer(at("2026-11-16", "21:00:00"), schedules)).toMatchObject({ prayer: "subuh", date: "2026-11-17" });
    expect(nextPrayer(at("2026-11-20", "12:00:00"), schedules)).toMatchObject({ prayer: "zohor", label: "Jumaat" });
  });
  it("returns null without data", () => {
    expect(nextPrayer(at("2026-12-01", "12:00:00"), schedules)).toBeNull();
  });
});
