export const PRAYER_KEYS = ["subuh", "syuruk", "zohor", "asar", "maghrib", "isyak"] as const;
export type PrayerKey = (typeof PRAYER_KEYS)[number];

/** Prayers that may trigger congregational Prayer Mode (never Syuruk). */
export const CONGREGATIONAL_PRAYERS = ["subuh", "zohor", "asar", "maghrib", "isyak"] as const;
export type CongregationalPrayer = (typeof CONGREGATIONAL_PRAYERS)[number];
export type PrayerModeKey = CongregationalPrayer | "jumaat";

export const PRAYER_LABELS: Record<PrayerKey | "jumaat", string> = {
  subuh: "Subuh",
  syuruk: "Syuruk",
  zohor: "Zohor",
  asar: "Asar",
  maghrib: "Maghrib",
  isyak: "Isyak",
  jumaat: "Jumaat",
};

/** One official day of prayer times for a zone. Times are KL wall-clock "HH:MM". */
export interface DaySchedule {
  date: string; // YYYY-MM-DD
  hijri: string | null;
  subuh: string;
  syuruk: string;
  zohor: string;
  asar: string;
  maghrib: string;
  isyak: string;
  source?: string;
  fetched_at?: string;
}

export interface PrayerModeEntry {
  enabled: boolean;
  countdown_minutes: number;
  solat_minutes: number;
  countdown_message?: string;
  solat_message?: string;
  replaces_zohor?: boolean;
}
export type PrayerModeConfig = Partial<Record<PrayerModeKey, PrayerModeEntry>>;

export interface PrayerOverride {
  id?: string;
  kind: "countdown" | "solat" | "normal";
  prayer: PrayerModeKey | null;
  starts_at: string; // ISO
  countdown_ends_at: string | null;
  ends_at: string; // ISO, already the effective end (cancellation applied)
}

export type DisplayMode = "normal" | "countdown" | "solat";
