import { z } from "zod";
import { MALAYSIAN_STATES, TRANSITIONS, FITS, MAX_DOCUMENT_BYTES } from "./constants";
import { isValidSlug } from "./slug";

const trimmed = (min: number, max: number, msg: string) =>
  z.string().trim().min(min, msg).max(max, `Maksimum ${max} aksara`);

export const zoneCode = z.string().regex(/^[A-Z]{3}\d{2}$/, "Sila pilih zon waktu solat");

export const passwordSchema = z
  .string()
  .min(10, "Kata laluan mesti sekurang-kurangnya 10 aksara")
  .max(72, "Kata laluan terlalu panjang")
  .regex(/[a-z]/, "Kata laluan perlu mengandungi huruf kecil")
  .regex(/[A-Z]/, "Kata laluan perlu mengandungi huruf besar")
  .regex(/\d/, "Kata laluan perlu mengandungi nombor");

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+?60|0)1\d{7,9}$|^(\+?60|0)[3-9]\d{7,8}$/, "Nombor telefon Malaysia tidak sah"));

export const registrationSchema = z.object({
  full_name: trimmed(3, 120, "Sila masukkan nama penuh"),
  email: z.string().trim().toLowerCase().email("Alamat e-mel tidak sah").max(254),
  phone: phoneSchema,
  password: passwordSchema,
  mosque_name: trimmed(3, 150, "Sila masukkan nama masjid/surau"),
  address: trimmed(10, 500, "Sila masukkan alamat lengkap"),
  state: z.enum(MALAYSIAN_STATES, { message: "Sila pilih negeri" }),
  district: trimmed(2, 80, "Sila masukkan daerah"),
  zone_code: zoneCode,
  applicant_position: trimmed(2, 80, "Sila nyatakan jawatan anda"),
});
export type RegistrationInput = z.infer<typeof registrationSchema>;

export const DOCUMENT_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const documentMetaSchema = z.object({
  size: z.number().int().positive("Sila lampirkan dokumen sokongan").max(MAX_DOCUMENT_BYTES, "Dokumen melebihi 5 MB"),
  type: z.enum(DOCUMENT_MIME, { message: "Dokumen mesti PDF, JPG, PNG atau WebP" }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Alamat e-mel tidak sah"),
  password: z.string().min(1, "Sila masukkan kata laluan").max(200),
});

export const itemSettingsSchema = z
  .object({
    duration_seconds: z.coerce.number().int().min(3).max(3600),
    transition: z.enum(TRANSITIONS),
    transition_ms: z.coerce.number().int().min(0).max(3000),
    fit: z.enum(FITS),
    is_active: z.coerce.boolean(),
  })
  .refine((v) => v.transition_ms < v.duration_seconds * 1000, {
    message: "Tempoh pertukaran mesti lebih pendek daripada tempoh paparan",
    path: ["transition_ms"],
  });
export type ItemSettings = z.infer<typeof itemSettingsSchema>;

export const uploadIntentSchema = z.object({
  name: trimmed(1, 120, "Sila namakan media"),
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"], { message: "Format fail tidak disokong" }),
  size: z.number().int().positive(),
});

export const finalizeSchema = z.object({
  playlist_id: z.string().uuid().nullable().optional(),
  settings: itemSettingsSchema.optional(),
});

export const prayerModeRowSchema = z.object({
  prayer: z.enum(["subuh", "zohor", "asar", "maghrib", "isyak", "jumaat"]),
  enabled: z.boolean(),
  countdown_minutes: z.number().int().min(1).max(120),
  solat_minutes: z.number().int().min(1).max(120),
  countdown_message: z.string().trim().max(160),
  solat_message: z.string().trim().max(160),
  replaces_zohor: z.boolean(),
});

export const displaySettingsSchema = z.object({
  clock_format: z.enum(["24h", "12h"]),
  show_seconds: z.boolean(),
  show_hijri: z.boolean(),
  solat_screen_style: z.enum(["message", "black"]),
  solat_title: z.string().trim().min(1).max(80),
  solat_subtitle: z.string().trim().max(160),
  countdown_subtitle: z.string().trim().max(160),
});

export const overrideSchema = z.object({
  kind: z.enum(["countdown", "solat", "normal"]),
  prayer: z.enum(["subuh", "zohor", "asar", "maghrib", "isyak", "jumaat"]).nullable(),
  countdown_minutes: z.number().int().min(1).max(120).nullable(),
  solat_minutes: z.number().int().min(1).max(60).nullable(),
  normal_minutes: z.number().int().min(1).max(180).nullable(),
});

export const slugSchema = z.string().trim().toLowerCase().refine(isValidSlug, {
  message: "Slug mesti 3–60 aksara (huruf kecil, nombor, tanda sempang) dan bukan laluan sistem",
});

export const heartbeatSchema = z.object({
  session_id: z.string().uuid(),
  mode: z.enum(["normal", "countdown", "solat"]),
  playlist_version: z.number().int().nonnegative().nullable(),
  schedule_ok: z.boolean(),
  screen: z.string().max(40),
  last_sync_at: z.string().datetime().nullable(),
});

/** Flatten zod issues into { field: message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
