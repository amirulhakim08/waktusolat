export const APP_NAME = "WaktuSolat";
export const DEFAULT_QUOTA_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MEDIA_BUCKET = "media";
export const DOCUMENTS_BUCKET = "registration-documents";

export const DURATION_OPTIONS = [5, 10, 15, 20, 30, 60] as const;
export const TRANSITION_MS_OPTIONS = [500, 1000, 1500, 2000, 3000] as const;
export const COUNTDOWN_OPTIONS = [5, 10, 15, 20, 30] as const;
export const SOLAT_OPTIONS = [3, 5, 7, 10, 15, 20] as const;

export const TRANSITIONS = ["fade", "slide_left", "slide_right", "zoom_in", "zoom_out", "wipe", "none"] as const;
export type Transition = (typeof TRANSITIONS)[number];
export const TRANSITION_LABELS: Record<Transition, string> = {
  fade: "Pudar (Fade)",
  slide_left: "Gelongsor ke Kiri",
  slide_right: "Gelongsor ke Kanan",
  zoom_in: "Zum Masuk",
  zoom_out: "Zum Keluar",
  wipe: "Sapuan (Wipe)",
  none: "Tiada",
};
export const FITS = ["contain", "cover"] as const;
export type Fit = (typeof FITS)[number];
export const FIT_LABELS: Record<Fit, string> = {
  contain: "Penuh (Contain) — keseluruhan gambar dipaparkan",
  cover: "Isi Skrin (Cover) — tepi gambar mungkin terpotong",
};

export const MALAYSIAN_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis",
  "Pulau Pinang", "Sabah", "Sarawak", "Selangor", "Terengganu", "Wilayah Persekutuan",
] as const;

/** A display is "online" if it sent a heartbeat within this window. */
export const DISPLAY_ONLINE_MS = 3 * 60 * 1000;
