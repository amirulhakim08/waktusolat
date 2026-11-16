/** Maps database/auth error identifiers to Bahasa Melayu messages. */
const MESSAGES: Record<string, string> = {
  forbidden: "Anda tidak mempunyai kebenaran untuk tindakan ini.",
  application_not_found: "Permohonan tidak dijumpai.",
  self_approval_not_allowed: "Anda tidak boleh meluluskan permohonan anda sendiri.",
  invalid_application_status: "Status permohonan tidak membenarkan tindakan ini.",
  applicant_is_master: "Pemohon ialah Master Super Admin.",
  applicant_already_admin: "Pemohon sudah menjadi pentadbir masjid lain.",
  invalid_slug: "Pautan (slug) tidak sah atau menggunakan laluan sistem.",
  slug_taken: "Pautan (slug) ini telah digunakan.",
  mosque_not_found: "Masjid tidak dijumpai.",
  mosque_has_active_admin: "Masjid ini sudah mempunyai pentadbir aktif. Pilih 'Gantikan pentadbir' untuk meneruskan.",
  mosque_admin_one_active_per_mosque: "Masjid ini sudah mempunyai pentadbir aktif.",
  mosque_admin_one_active_per_user: "Pengguna ini sudah mentadbir masjid lain.",
  note_required: "Sila nyatakan sebab/catatan (sekurang-kurangnya 5 aksara).",
  invalid_response: "Sila tulis maklum balas (5–2000 aksara).",
  no_active_admin: "Tiada pentadbir aktif untuk masjid ini.",
  invalid_quota: "Kuota mesti antara 1 MB dan 10 GB.",
  invalid_size: "Saiz fail tidak sah.",
  unsupported_type: "Format fail tidak disokong.",
  file_too_large: "Fail melebihi saiz maksimum yang dibenarkan.",
  mosque_not_active: "Masjid tidak aktif.",
  quota_exceeded: "Ruang storan tidak mencukupi. Padam media lama atau hubungi pentadbir sistem.",
  asset_not_found: "Media tidak dijumpai.",
  reservation_expired: "Tempoh muat naik tamat. Sila cuba semula.",
  size_mismatch: "Saiz fail tidak sepadan dengan yang diisytiharkan.",
  media_in_playlist: "Media ini masih digunakan dalam playlist. Keluarkan daripada playlist dahulu.",
  media_published: "Media ini sedang dipaparkan di TV. Terbitkan playlist tanpa media ini dahulu.",
  media_not_in_mosque: "Media bukan milik masjid ini.",
  media_not_ready: "Media belum siap dimuat naik.",
  playlist_not_found: "Playlist tidak dijumpai.",
  invalid_duration: "Tempoh tidak sah.",
  invalid_logo: "Logo mesti gambar milik masjid ini.",
  role_change_forbidden: "Perubahan peranan tidak dibenarkan.",
  mosque_applications_one_open_per_applicant: "Anda sudah mempunyai permohonan yang sedang diproses.",
};

export function friendlyError(err: unknown, fallback = "Ralat tidak dijangka. Sila cuba lagi."): string {
  const msg = typeof err === "string" ? err : (err as { message?: string } | null)?.message ?? "";
  for (const key of Object.keys(MESSAGES)) {
    if (msg.includes(key)) return MESSAGES[key];
  }
  if (/row-level security|permission denied/i.test(msg)) return MESSAGES.forbidden;
  if (/check constraint/i.test(msg)) return "Nilai yang dimasukkan tidak sah.";
  return fallback;
}

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fields?: Record<string, string> };
