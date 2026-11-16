import type { DaySchedule, PrayerModeConfig, PrayerOverride } from "@/lib/prayer/types";
import type { SlideItem } from "@/lib/slideshow";

export interface DisplaySettings {
  clock_format: "24h" | "12h";
  show_seconds: boolean;
  show_hijri: boolean;
  solat_screen_style: "message" | "black";
  solat_title: string;
  solat_subtitle: string;
  countdown_subtitle: string;
}

export interface DisplayPayload {
  mosque: { id: string; name: string; slug: string; zone: string; district?: string; state?: string; logo_path: string | null };
  playlist: { version: number; published_at: string; items: SlideItem[] } | null;
  prayer_mode: PrayerModeConfig;
  display: Partial<DisplaySettings>;
  overrides: PrayerOverride[];
  schedules: DaySchedule[];
  server_time: string;
  media_base: string;
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  clock_format: "24h",
  show_seconds: true,
  show_hijri: true,
  solat_screen_style: "message",
  solat_title: "Solat Sedang Berlangsung",
  solat_subtitle: "Sila jaga ketenangan dan kekhusyukan jemaah.",
  countdown_subtitle: "Sila bersedia untuk menunaikan solat.",
};
