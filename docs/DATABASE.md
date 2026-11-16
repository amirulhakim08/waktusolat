# Database

PostgreSQL (Supabase). Everything lives in the **`waktusolat` schema** (buckets `waktusolat-media` / `waktusolat-documents`, realtime channels `waktusolat-display:*`) so the Supabase project can be shared with other applications. Only auth users created by WaktuSolat (`raw_user_meta_data.app = 'waktusolat'`) get a WaktuSolat profile; other apps' users are ignored and cannot log in to WaktuSolat. All business rules that matter for security live in the database: Row Level Security on every table, column-level grants, and `SECURITY DEFINER` functions for privileged transitions. The Next.js server never relies on client-side checks.

## Roles

| Who | How identified |
|---|---|
| Master Super Admin | `profiles.role = 'master'` (set only by `bootstrap_master()` via service role) |
| Mosque Super Admin | an `active` row in `mosque_admin_assignments` **and** the mosque is `active` → `admin_mosque_id()` |
| Applicant | any other authenticated user (`profiles.role = 'applicant'`) |
| Public viewer | `anon`; reads only through `get_public_display(slug)` |
| Server (service role) | bypasses RLS; used only for uploads/finalisation, document links, heartbeats, schedule sync, rate limiting, cron |

Helper functions used by policies: `is_master()`, `admin_mosque_id()`, `can_manage_mosque(mosque_id)`.

## Tables & permission model

| Table | Purpose | anon | applicant | mosque admin | master | writes via |
|---|---|---|---|---|---|---|
| `profiles` | identity + role | – | own (name/phone editable) | own | all | trigger on `auth.users`; role only via functions |
| `prayer_zones` | JAKIM zones | read | read | read | read | migration |
| `system_settings` | defaults, limits (single row) | – | read | read | read/update | master |
| `mosques` | tenant root | – | – | own (profile columns) | all | `approve_application`, `set_mosque_*` |
| `mosque_slug_history` | old slugs → redirects | – | – | own | all | `set_mosque_slug` |
| `mosque_applications` | registrations | – | own | – | all | server (service role) + review functions |
| `mosque_admin_assignments` | admin history; **unique active per mosque & per user** | – | own | own | all | review/revoke functions |
| `prayer_schedules` | cached official times (`unique(zone,date)`, ordered-times check) | read | read | read | read | service role sync |
| `prayer_fetch_log` | sync status/cooldown | – | read | read | read | service role |
| `media_assets` | media metadata (pending reservations + ready) | – | – | own (rename) | all | `reserve_media_upload`, `finalize_media_upload`, `delete_media_asset` |
| `storage_deletion_queue` | keeps bucket and DB consistent | – | – | – | – | functions; drained by server/cron |
| `playlists`, `playlist_items` | drafts with per-item settings | – | – | own CRUD | all | direct (RLS) |
| `playlist_versions` | **immutable** published snapshots | – | – | own read | read | `publish_playlist` |
| `display_settings` | draft display options | – | – | own | all | direct (RLS, column grants) |
| `prayer_mode_settings` | draft per-prayer settings (incl. `jumaat`) | – | – | own | all | direct (RLS, column grants) |
| `mosque_publications` | live pointer: playlist version + published prayer/display snapshots | – | – | own read | read | publish functions |
| `prayer_mode_overrides` | manual overrides (max 3 h, audited) | – | – | own read | read | `create_prayer_override`, `clear_prayer_override` |
| `display_sessions` | browser heartbeats | – | – | own read | read | service role |
| `audit_logs` | **append-only** | – | – | own mosque read | read all | functions/triggers only |
| `notifications` | in-app notifications | – | own | own | own | functions |
| `rate_limits` | fixed-window limiter | – | – | – | – | `check_rate_limit` (service role) |

Every tenant table carries `mosque_id`; `playlist_items` additionally has a composite FK `(playlist_id, mosque_id)` and a trigger that rejects media from another mosque.

## Key functions

| Function | Caller | Notes |
|---|---|---|
| `approve_application(app, slug, existing_mosque?, replace_admin?, note?)` | master | Locks the application, blocks self-approval, validates slug, creates mosque + defaults or links an existing mosque; replacing an admin must be explicit. Unique indexes make concurrent approvals safe. |
| `reject_application`, `request_application_info` | master | Note required; applicant notified. |
| `respond_application_info` | applicant | Back to `pending_approval`; master notified. |
| `set_mosque_status`, `revoke_mosque_admin`, `set_mosque_quota` | master | Audited. |
| `set_mosque_slug` | master / own admin | Old slug kept for redirects; cannot steal another mosque's old slug. |
| `reserve_media_upload` | own admin / master | Validates type/size, **locks the mosque row**, checks `used + pending + new ≤ quota`, inserts a 30-min reservation. |
| `finalize_media_upload` | service role | Actual size must be ≤ reserved. |
| `delete_media_asset` | own admin / master | Refuses media used in a draft playlist or the live version; queues object deletion. |
| `publish_playlist`, `publish_prayer_mode`, `publish_display_settings` | own admin / master | Create snapshots; drafts never reach the public. |
| `create_prayer_override`, `clear_prayer_override` | own admin / master | Bounded durations, previous state recorded. |
| `get_public_display(slug)` | anon | Only public, published data for an **active** mosque (+ slug redirect / unavailable flag) and schedules for yesterday…+7 days. |
| `get_storage_summary(mosque?)` | admin / master | Scoped by `can_manage_mosque`. |
| `check_rate_limit`, `cleanup_expired_reservations`, `bootstrap_master` | service role | |

## Application lifecycle

`pending_verification` → (email confirmed, trigger) → `pending_approval` → `approved` | `rejected` | `info_requested` → (`respond_application_info`) → `pending_approval`.

## Storage

- `waktusolat-media` bucket: public read, writes only through server-issued signed upload URLs; path `mosques/{mosque_id}/media/{asset_id}.{ext}`. No `storage.objects` policies exist for `anon`/`authenticated`, so they cannot list, write or delete objects.
- `waktusolat-documents` bucket: private; read only through 2-minute signed URLs generated for the Master.

## Testing

`tests/db/security.test.ts` runs the migrations on a fresh PostgreSQL database and verifies (33 tests): registration triggers, unverified approval refusal, self-approval prevention, one-active-admin constraint (including concurrent approvals), cross-tenant read/write denial, role elevation denial, public read-only behaviour and draft isolation, slug redirects, quota enforcement (including 6 concurrent reservations), media deletion safety, immutable versions and audit logs, overrides and rate limiting.
