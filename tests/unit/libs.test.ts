import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseEsolatDate, parseEsolatResponse, parseEsolatTime, EsolatError, fetchZoneSchedule } from "@/lib/prayer/esolat";
import { RESERVED_SLUGS, isValidSlug, slugify, uniqueSlug } from "@/lib/slug";
import { registrationSchema, itemSettingsSchema } from "@/lib/validation";
import { detectFileType, mp4VideoCodec } from "@/lib/media/detect";
import { effectiveTransitionMs, nextPlayableIndex, type SlideItem } from "@/lib/slideshow";
import { formatCountdown, formatHijri, klDateString, klWallTimeToEpoch, formatClock, isFriday } from "@/lib/time";

const sample = {
  prayerTime: [
    { hijri: "1448-05-25", date: "15-Nov-2026", day: "Sunday", imsak: "05:41:00", fajr: "05:51:00", syuruk: "06:59:00", dhuhr: "12:59:00", asr: "16:22:00", maghrib: "18:56:00", isha: "20:10:00" },
    { hijri: "1448-05-26", date: "16-Nov-2026", day: "Monday", imsak: "05:41:00", fajr: "05:51:00", syuruk: "06:59:00", dhuhr: "12:59:00", asr: "16:22:00", maghrib: "18:56:00", isha: "20:10:00" },
  ],
  status: "OK!", serverTime: "2026-11-15 10:00:00", periodType: "duration", lang: "ms_my", zone: "SGR01",
};

describe("e-Solat parser", () => {
  it("parses the documented response format", () => {
    const r = parseEsolatResponse(sample, "SGR01");
    expect(r.rejected).toBe(0);
    expect(r.days[0]).toMatchObject({ date: "2026-11-15", hijri: "1448-05-25", subuh: "05:51", syuruk: "06:59", zohor: "12:59", asar: "16:22", maghrib: "18:56", isyak: "20:10", imsak: "05:41" });
  });
  it("rejects error statuses, wrong zones and malformed payloads", () => {
    expect(() => parseEsolatResponse({ ...sample, status: "NO_RECORD!" }, "SGR01")).toThrow(EsolatError);
    expect(() => parseEsolatResponse(sample, "JHR01")).toThrow(/Zon tidak sepadan/);
    expect(() => parseEsolatResponse("<html>", "SGR01")).toThrow(EsolatError);
  });
  it("drops implausible or corrupt entries instead of guessing", () => {
    const bad = { ...sample, prayerTime: [{ ...sample.prayerTime[0], maghrib: "12:00:00" }, { ...sample.prayerTime[1], date: "31-Feb-2026" }, sample.prayerTime[1]] };
    const r = parseEsolatResponse(bad, "SGR01");
    expect(r.days).toHaveLength(1);
    expect(r.rejected).toBe(2);
  });
  it("parses dates and times strictly", () => {
    expect(parseEsolatDate("01-Jan-2027")).toBe("2027-01-01");
    expect(parseEsolatDate("2027-01-01")).toBe("2027-01-01");
    expect(parseEsolatDate("32-Jan-2027")).toBeNull();
    expect(parseEsolatTime("5:51:00")).toBeNull();
    expect(parseEsolatTime("05:51")).toBe("05:51");
  });
  it("falls back from duration to month and surfaces network errors", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url.includes("duration")) return new Response("oops", { status: 500 });
      return new Response(JSON.stringify(sample), { status: 200 });
    }) as unknown as typeof fetch;
    const { result, url } = await fetchZoneSchedule("SGR01", "2026-11-15", "2026-12-15", { fetchImpl: fake });
    expect(result.days).toHaveLength(2);
    expect(url).toContain("period=month");
    expect(calls).toHaveLength(2);
    const failing = (async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchZoneSchedule("SGR01", "2026-11-15", "2026-12-15", { fetchImpl: failing })).rejects.toThrow(/HTTP 503/);
  });
});

describe("slugs", () => {
  it("slugifies mosque names", () => {
    expect(slugify("Surau Al-Amin")).toBe("surau-al-amin");
    expect(slugify("Masjid  Al-Hidayah (Taman Melati)")).toBe("masjid-al-hidayah-taman-melati");
    expect(slugify("Admin")).toBe("admin-masjid");
    expect(isValidSlug(slugify("Ab"))).toBe(true);
  });
  it("validates and deduplicates", () => {
    expect(isValidSlug("register")).toBe(false);
    expect(isValidSlug("Masjid-A")).toBe(false);
    expect(isValidSlug("masjid-a")).toBe(true);
    expect(uniqueSlug("masjid-a", new Set(["masjid-a", "masjid-a-2"]))).toBe("masjid-a-3");
  });
  it("reserved list matches the database function", () => {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261115000100_core_schema.sql"), "utf8");
    const block = /is_reserved_slug[\s\S]*?array\[([\s\S]*?)\]/.exec(sql)![1];
    const dbList = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(dbList).toEqual([...RESERVED_SLUGS].sort());
  });
});

describe("validation", () => {
  const valid = {
    full_name: "Ahmad bin Ali", email: "Ahmad@Example.com", phone: "012-345 6789", password: "Kuat12345A",
    mosque_name: "Surau Al-Amin", address: "Jalan Melati 1, Taman Melati", state: "Selangor", district: "Gombak",
    zone_code: "SGR01", applicant_position: "Setiausaha",
  };
  it("accepts a valid registration and normalises fields", () => {
    const r = registrationSchema.parse(valid);
    expect(r.email).toBe("ahmad@example.com");
    expect(r.phone).toBe("0123456789");
  });
  it("rejects invalid registrations", () => {
    expect(registrationSchema.safeParse({ ...valid, email: "x" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, zone_code: "sgr1" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, state: "Narnia" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, phone: "12345" }).success).toBe(false);
  });
  it("requires transitions shorter than durations", () => {
    expect(itemSettingsSchema.safeParse({ duration_seconds: 5, transition: "fade", transition_ms: 3000, fit: "contain", is_active: true }).success).toBe(true);
    expect(itemSettingsSchema.safeParse({ duration_seconds: 3, transition: "fade", transition_ms: 3000, fit: "contain", is_active: true }).success).toBe(false);
  });
});

describe("file sniffing", () => {
  it("detects real formats regardless of extension", () => {
    expect(detectFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectFileType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(detectFileType(new TextEncoder().encode("\0\0\0\x18ftypmp42"))).toBe("video/mp4");
    expect(detectFileType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(detectFileType(new TextEncoder().encode("<?php echo 1;"))).toBeNull();
    expect(detectFileType(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
  it("identifies H.264 vs HEVC MP4", () => {
    expect(mp4VideoCodec(new TextEncoder().encode("....stsd....avc1....avcC"))).toBe("h264");
    expect(mp4VideoCodec(new TextEncoder().encode("....stsd....hvc1....hvcC"))).toBe("hevc");
    expect(mp4VideoCodec(new TextEncoder().encode("....stsd....mp4v"))).toBe("unknown");
  });
});

describe("slideshow helpers", () => {
  const item = (id: string, over: Partial<SlideItem> = {}): SlideItem => ({
    item_id: id, media_id: id, kind: "image", name: id, path: id, mime: "image/jpeg", size: 1, width: 1, height: 1,
    duration_seconds: 10, transition: "fade", transition_ms: 1000, fit: "contain", ...over,
  });
  it("loops and skips failed media", () => {
    const items = [item("a"), item("b"), item("c")];
    expect(nextPlayableIndex(items, 2, new Set())).toBe(0);
    expect(nextPlayableIndex(items, 0, new Set(["b"]))).toBe(2);
    expect(nextPlayableIndex(items, 0, new Set(["a", "b", "c"]))).toBe(-1);
    expect(nextPlayableIndex([], 0, new Set())).toBe(-1);
    expect(nextPlayableIndex([item("a")], 0, new Set())).toBe(0);
  });
  it("keeps transitions inside the slide duration", () => {
    expect(effectiveTransitionMs(item("a", { transition: "none" }))).toBe(0);
    expect(effectiveTransitionMs(item("a", { duration_seconds: 3, transition_ms: 3000 }))).toBe(2750);
    expect(effectiveTransitionMs(item("a"))).toBe(1000);
  });
});

describe("time helpers", () => {
  it("converts KL wall time and dates", () => {
    const t = klWallTimeToEpoch("2026-11-16", "00:30");
    expect(new Date(t).toISOString()).toBe("2026-11-15T16:30:00.000Z");
    expect(klDateString(t)).toBe("2026-11-16");
    expect(isFriday("2026-11-20")).toBe(true);
  });
  it("formats countdowns, clocks and Hijri dates", () => {
    expect(formatCountdown(5 * 60_000)).toBe("05:00");
    expect(formatCountdown(119_001)).toBe("02:00");
    expect(formatCountdown(-5)).toBe("00:00");
    expect(formatCountdown(3_723_000)).toBe("1:02:03");
    expect(formatHijri("1448-05-25")).toBe("25 Jamadilawal 1448H");
    expect(formatHijri("bad")).toBeNull();
    expect(formatClock(klWallTimeToEpoch("2026-11-16", "19:05:09"), "12h", false)).toEqual({ time: "7:05", suffix: "PTG" });
  });
});
