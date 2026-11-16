# Panduan Pentadbir WaktuSolat

Panduan ini untuk **Master Super Admin** (pentadbir sistem) dan **Pentadbir Masjid/Surau**.

---

## A. Pentadbir Masjid / Surau

### 1. Mendaftar
1. Buka `https://waktusolat.vercel.app/register`.
2. Isi maklumat diri, maklumat masjid/surau, pilih **negeri** dan **zon waktu solat JAKIM**.
3. (Pilihan) Lampirkan **surat kebenaran/lantikan** (PDF atau gambar, maksimum 5 MB).
4. Klik pautan pengesahan dalam e-mel anda.
5. Tunggu kelulusan. Semak status di `/permohonan` selepas log masuk. Jika pentadbir sistem meminta maklumat tambahan, jawab terus di halaman tersebut.

### 2. Papan pemuka (`/admin`)
Menunjukkan zon, waktu solat seterusnya, bilangan gambar, playlist yang sedang dipaparkan, storan dan bilangan paparan dalam talian.

### 3. Muat naik poster (`/admin/media`)
1. **Pilih fail** — JPEG, PNG atau WebP (maksimum 2 MB), atau video MP4 H.264 (pilihan).
2. Semak **pratonton** (nisbah skrin TV 16:9).
3. Tetapkan:
   - **Tempoh Paparan Gambar** (5–60 saat, lalai 10 saat). Tempoh ini dikira dari mula pertukaran gambar ini hingga gambar seterusnya mula bertukar.
   - **Efek Pertukaran** — Pudar, Gelongsor ke Kiri/Kanan, Zum Masuk/Keluar, Sapuan, atau Tiada.
   - **Tempoh Pertukaran** (0.5–3 saat). Mesti lebih pendek daripada tempoh paparan.
   - **Muat Gambar** — *Penuh (Contain)* memaparkan keseluruhan gambar; *Isi Skrin (Cover)* memenuhi skrin tetapi tepi gambar mungkin terpotong.
   - **Aktif / Tidak aktif**.
4. Pilih playlist dan klik **Muat naik**.

> Tip: Reka poster pada saiz 1920×1080 piksel supaya teks jelas di TV. Sistem tidak memampatkan gambar sehingga teks kabur.

### 4. Susun playlist (`/admin/playlist`)
- Seret item (⋮⋮) atau guna ↑ ↓ untuk menyusun.
- Klik **Tetapan** untuk menukar tempoh/efek setiap gambar tanpa memuat naik semula.
- **Simpan Draf** — perubahan disimpan tetapi **TV belum berubah**.
- **Pratonton Draf** — lihat hasil sebelum diterbitkan.
- **Terbitkan ke TV** — semua paparan dikemas kini dalam beberapa saat (selewat-lewatnya 1 minit). Jika TV sedang dalam Mod Solat, playlist baharu dipaparkan selepas Mod Solat tamat.

### 5. Mod Solat (`/admin/prayer-mode`)
Bagi setiap waktu (Subuh, Zohor, Asar, Maghrib, Isyak):
- **Aktif** — hidupkan/matikan Mod Solat automatik.
- **Countdown Sebelum Solat** — tempoh dari waktu solat rasmi hingga solat berjemaah dijangka bermula.
- **Tempoh Mod Solat** — berapa lama skrin tenang dipaparkan.
- Mesej countdown dan Mod Solat (pilihan).

Contoh Maghrib 7:12 PTG, countdown 5 minit, Mod Solat 5 minit: 7:12–7:17 countdown, 7:17–7:22 Mod Solat, selepas 7:22 kembali ke slaid.

**Jumaat**: tandakan *Guna tetapan khas Jumaat* untuk menetapkan countdown/Mod Solat khas bermula pada waktu Zohor rasmi hari Jumaat.

Klik **Simpan Draf**, semak dengan **Pratonton**, kemudian **Terbitkan ke TV**.

### 6. Kawalan manual
Jika imam memulakan solat lebih awal atau lewat:
- **Mulakan Countdown Sekarang** — countdown baharu bermula serta-merta.
- **Mulakan Mod Solat Sekarang** — terus ke skrin Mod Solat.
- **Tamatkan Mod Solat** — kembali ke slaid.
- **Kembali ke Jadual Automatik** — batalkan kawalan manual.

Kawalan manual berkuat kuasa di semua TV, direkodkan dalam log, dan tamat sendiri (maksimum 3 jam).

### 7. Lain-lain
- **Profil Masjid** — nama, alamat, zon, pautan awam (slug) dan logo.
- **Tetapan Paparan** — format jam 12/24 jam, saat, tarikh Hijrah, gaya skrin Mod Solat (mesej atau hitam sepenuhnya).
- **Penggunaan Storan** — kuota 100 MB. Amaran pada 80%, 95% dan 100%.
- **Pemantauan Paparan** — senarai TV/pelayar yang sedang membuka paparan masjid anda.
- **Sejarah Penerbitan** — semua versi playlist dan aktiviti.

---

## B. Master Super Admin

### Kelulusan (`/master/approvals`)
1. Buka permohonan, semak identiti pemohon, maklumat masjid dan **dokumen sokongan** (pautan peribadi 2 minit).
2. Semak bahagian **Semakan pertindihan** — masjid sedia ada dengan nama serupa dan sama ada ia sudah mempunyai pentadbir aktif.
3. Pilih:
   - **Luluskan** — tetapkan pautan awam (slug). Untuk masjid sedia ada, pilih masjid tersebut; tandakan *Gantikan pentadbir aktif* hanya jika penggantian memang dikehendaki.
   - **Minta maklumat tambahan** — pemohon menjawab dari halaman status mereka.
   - **Tolak** — nyatakan sebab.

Anda tidak boleh meluluskan permohonan anda sendiri. Setiap masjid hanya boleh mempunyai **seorang** pentadbir aktif.

### Pengurusan masjid (`/master/mosques`)
Cari masjid, lihat pentadbir, storan dan paparan. Di halaman masjid:
- **Gantung / Aktifkan semula** — paparan TV dan akses pentadbir dihentikan semasa digantung.
- **Kuota storan**, **pautan awam**.
- **Tarik balik pentadbir** — untuk menggantikan pentadbir, tarik balik akses, kemudian luluskan permohonan baharu dan kaitkan dengan masjid ini.
- **Urus konfigurasi masjid** — membuka `/admin` bagi masjid tersebut (contohnya untuk membetulkan tetapan Mod Solat). Klik *Kembali ke Master* untuk keluar.

### Pemantauan
- `/master/storage` — penggunaan dan kuota setiap masjid.
- `/master/displays` — sesi paparan (heartbeat ≠ TV fizikal hidup).
- `/master/audit-logs` — log tindakan yang tidak boleh diubah.
- `/master/settings` — kuota lalai, saiz video maksimum, slaid dan Mod Solat lalai untuk masjid baharu.
