# Architecture, assumptions & limitations

## Overview

```
 TV browser (/[slug])  ──GET /api/display/[slug] (CDN 10 s)──▶ Next.js route ──rpc get_public_display (anon)──▶ Postgres
        │  ▲                                                          │
        │  └── Supabase Realtime broadcast "update" (display:{id}) ◀──┤ admin actions (publish / override)
        ├── GET /api/time (clock offset)                              │
        ├── POST heartbeat (60 s) ──────────────────────────────▶ service role → display_sessions
        └── media: Supabase Storage public CDN (immutable UUID paths)

 Admin browser ──server actions / route handlers (cookies, RLS as user)──▶ Postgres functions (SECURITY DEFINER checks)
                └── signed upload URL ──▶ Storage ──▶ finalize (server sniffs bytes, optimises) ──▶ media_assets ready

 Vercel Cron (daily) ──▶ /api/cron/daily ──▶ JAKIM e-Solat → prayer_schedules; cleanup reservations/objects/sessions
```

## Key decisions

- **Prayer Mode is computed, not stored.** `computeDisplayState()` (src/lib/prayer/engine.ts) derives the mode from absolute time each second, so every TV is independent and refresh/sleep/reconnect are naturally correct. Overrides are stored with absolute timestamps; a scheduled window that overlapped a manual override is never re-triggered.
- **Malaysia time is UTC+8 with no DST**, so KL wall-time → instant uses a fixed offset (cheap and deterministic on TV browsers). Display formatting uses the IANA zone.
- **Clock drift correction**: offset to the NTP-synced server measured via `/api/time` (RTT/2 compensation) every 10 min and on wake; the last offset is reused offline.
- **Drafts vs published**: editable tables (`playlist_items`, `prayer_mode_settings`, `display_settings`) are drafts; publishing writes immutable `playlist_versions` and snapshots in `mosque_publications`. The public function reads only the published side.
- **Quota safety**: uploads reserve bytes inside a transaction that locks the mosque row; reservations expire after 30 min and are cleaned up; finalisation can only shrink a reservation.
- **Realtime as a hint**: broadcasts carry no content, only "refetch"; polling every 60 s guarantees convergence.
- **Media bucket is public-read with unguessable paths** (UUIDs) for CDN caching and offline-friendly immutable URLs. Draft media is never listed by any public API, but anyone holding an exact URL could fetch it. If stricter secrecy is required, switch the bucket to private and return signed URLs from `/api/display` (the SW already ignores query strings when caching).

## Prayer-time data source

- Integration targets the JAKIM e-Solat API (`https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat`), `period=duration` (POST `datestart`/`dateend`) with a `period=month` fallback, using the documented response shape (`prayerTime[]` with `hijri`, `date` `DD-Mon-YYYY`, `fajr`, `syuruk`, `dhuhr`, `asr`, `maghrib`, `isha`; `status: "OK!"`).
- **Not verified live from the development environment**: outbound access to `e-solat.gov.my` was blocked by the build sandbox's network policy. The parser is strict (zone must match, times well-formed, ordered and within plausible Malaysian bounds) and rejects anything unexpected instead of guessing, so a format change results in a visible warning, never wrong times. Verify with a real request after deployment (see DEPLOYMENT.md checklist) and review JAKIM's terms of use for automated access.
- The zone list (`prayer_zones`) follows the published e-Solat zones; verify it against e-Solat before go-live. Zones can be deactivated without code changes.
- Hijri date shown is the one supplied by e-Solat for the Gregorian date.

## Friday interpretation

`jumaat.enabled = false` → Friday Zohor behaves like any day. `enabled = true, replaces_zohor = true` → Friday Zohor uses the Jumaat countdown/Solat durations and messages, starting at the official Zohor time (no invented congregational time). `enabled = true, replaces_zohor = false` → ordinary Zohor durations, Jumaat label/messages.

## Known limitations / not verified

- No deployment has been performed; Supabase Auth e-mail delivery, Storage signed uploads, Realtime broadcast and the e-Solat endpoint were **not exercised against live services** here. They are implemented against documented APIs; the DB logic is tested on real PostgreSQL and the display end-to-end in Chromium with mocked network.
- Applicant decision e-mails require `RESEND_API_KEY`; otherwise decisions are delivered in-app (`/permohonan`) only. Verification e-mails are sent by Supabase Auth.
- Video duration metadata is not parsed; the configured slide duration acts as the maximum play time.
- The rate limiter fails open if the database is unreachable (logged), to avoid locking out legitimate users.
- Physical Android TV hardware was not available for testing; compatibility is based on the features used (see ANDROID_TV_SETUP.md).
