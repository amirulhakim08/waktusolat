-- =====================================================================
-- WaktuSolat — core schema
-- Multi-tenant prayer-time & digital signage platform.
--
-- Ownership model (summary, see DATABASE.md for the full matrix):
--   * Master Super Admin  -> profiles.role = 'master'
--   * Mosque Super Admin  -> active row in mosque_admin_assignments
--   * Public viewer       -> anonymous; reads ONLY through get_public_display()
-- All tenant tables carry mosque_id and are protected by RLS using
-- public.can_manage_mosque(mosque_id).
-- =====================================================================

set check_function_bodies = off;

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
create type public.app_role as enum ('master', 'mosque_admin', 'applicant');
create type public.mosque_status as enum ('active', 'suspended');
create type public.application_status as enum (
  'pending_verification', 'pending_approval', 'info_requested', 'approved', 'rejected'
);
create type public.assignment_status as enum ('active', 'revoked');
create type public.media_kind as enum ('image', 'video');
create type public.media_status as enum ('pending', 'ready');
create type public.prayer_mode_key as enum ('subuh', 'zohor', 'asar', 'maghrib', 'isyak', 'jumaat');
create type public.transition_effect as enum (
  'fade', 'slide_left', 'slide_right', 'zoom_in', 'zoom_out', 'wipe', 'none'
);
create type public.image_fit as enum ('contain', 'cover');
create type public.override_kind as enum ('countdown', 'solat', 'normal');

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Slugs that collide with application routes. Keep in sync with
-- src/lib/slug.ts (RESERVED_SLUGS). A unit test checks both lists match.
create or replace function public.is_reserved_slug(p_slug text)
returns boolean language sql immutable as $$
  select lower(p_slug) = any (array[
    'admin','master','login','logout','register','api','auth','permohonan',
    '_next','static','public','offline','manifest','sw','favicon','icons',
    'robots','sitemap','help','bantuan','about','settings','display','media',
    'assets','www','app','dashboard','account','akaun','privacy','terms',
    'status','preview','null','undefined'
  ]);
$$;

create or replace function public.is_valid_slug(p_slug text)
returns boolean language sql immutable as $$
  select p_slug is not null
     and p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     and char_length(p_slug) between 3 and 60
     and not public.is_reserved_slug(p_slug);
$$;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------
create table public.prayer_zones (
  code text primary key check (code ~ '^[A-Z]{3}[0-9]{2}$'),
  state text not null,
  name text not null,
  is_active boolean not null default true
);

create table public.system_settings (
  id smallint primary key default 1 check (id = 1),
  default_storage_quota_bytes bigint not null default 104857600 check (default_storage_quota_bytes > 0),
  max_image_bytes bigint not null default 2097152 check (max_image_bytes > 0),
  max_video_bytes bigint not null default 52428800 check (max_video_bytes > 0),
  default_prayer_mode jsonb not null default '{
    "subuh":   {"enabled": true,  "countdown_minutes": 15, "solat_minutes": 5},
    "zohor":   {"enabled": true,  "countdown_minutes": 10, "solat_minutes": 5},
    "asar":    {"enabled": true,  "countdown_minutes": 10, "solat_minutes": 5},
    "maghrib": {"enabled": true,  "countdown_minutes": 5,  "solat_minutes": 5},
    "isyak":   {"enabled": true,  "countdown_minutes": 15, "solat_minutes": 5},
    "jumaat":  {"enabled": false, "countdown_minutes": 30, "solat_minutes": 15, "replaces_zohor": true}
  }'::jsonb,
  default_slide_duration_seconds int not null default 10 check (default_slide_duration_seconds between 3 and 3600),
  default_transition public.transition_effect not null default 'fade',
  default_transition_ms int not null default 1000 check (default_transition_ms between 0 and 3000),
  default_fit public.image_fit not null default 'contain',
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.system_settings (id) values (1);

-- ---------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text not null default '' check (char_length(phone) <= 30),
  role public.app_role not null default 'applicant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Mosques
-- ---------------------------------------------------------------------
create table public.mosques (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 150),
  slug text not null unique check (public.is_valid_slug(slug)),
  address text not null default '' check (char_length(address) <= 500),
  state text not null default '' check (char_length(state) <= 60),
  district text not null default '' check (char_length(district) <= 80),
  zone_code text not null references public.prayer_zones (code),
  status public.mosque_status not null default 'active',
  status_reason text,
  storage_quota_bytes bigint not null default 104857600 check (storage_quota_bytes > 0),
  logo_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mosques_status_idx on public.mosques (status);
create index mosques_zone_idx on public.mosques (zone_code);
create trigger mosques_updated_at before update on public.mosques
  for each row execute function public.set_updated_at();

-- Old slugs kept for safe redirects after a slug change.
create table public.mosque_slug_history (
  old_slug text primary key,
  mosque_id uuid not null references public.mosques (id) on delete cascade,
  changed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Registration applications
-- ---------------------------------------------------------------------
create table public.mosque_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  mosque_name text not null,
  address text not null,
  state text not null,
  district text not null,
  zone_code text not null references public.prayer_zones (code),
  applicant_position text not null,
  document_path text,
  document_name text,
  document_size bigint,
  document_mime text,
  status public.application_status not null default 'pending_verification',
  master_note text,
  applicant_response text,
  email_verified_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  mosque_id uuid references public.mosques (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mosque_applications_status_idx on public.mosque_applications (status, created_at desc);
create unique index mosque_applications_one_open_per_applicant
  on public.mosque_applications (applicant_id)
  where status in ('pending_verification', 'pending_approval', 'info_requested');
create trigger mosque_applications_updated_at before update on public.mosque_applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Admin assignments (history + exactly one active admin per mosque)
-- ---------------------------------------------------------------------
create table public.mosque_admin_assignments (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosques (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  application_id uuid references public.mosque_applications (id),
  status public.assignment_status not null default 'active',
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id),
  revoked_at timestamptz,
  revoke_reason text,
  check ((status = 'revoked') = (revoked_at is not null))
);
-- THE core business rule: one active Mosque Super Admin per mosque…
create unique index mosque_admin_one_active_per_mosque
  on public.mosque_admin_assignments (mosque_id) where status = 'active';
-- …and one user administers at most one mosque at a time.
create unique index mosque_admin_one_active_per_user
  on public.mosque_admin_assignments (user_id) where status = 'active';

-- ---------------------------------------------------------------------
-- Official prayer schedules (cached from JAKIM e-Solat)
-- ---------------------------------------------------------------------
create table public.prayer_schedules (
  id uuid primary key default gen_random_uuid(),
  zone_code text not null references public.prayer_zones (code),
  date date not null,
  hijri_date text check (hijri_date is null or hijri_date ~ '^\d{4}-\d{2}-\d{2}$'),
  imsak time,
  subuh time not null,
  syuruk time not null,
  zohor time not null,
  asar time not null,
  maghrib time not null,
  isyak time not null,
  source text not null default 'jakim-esolat',
  source_url text,
  fetched_at timestamptz not null default now(),
  validated_at timestamptz not null default now(),
  unique (zone_code, date),
  check (subuh < syuruk and syuruk < zohor and zohor < asar and asar < maghrib and maghrib < isyak)
);

create table public.prayer_fetch_log (
  zone_code text primary key references public.prayer_zones (code),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text
);

-- ---------------------------------------------------------------------
-- Media
-- ---------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosques (id) on delete cascade,
  kind public.media_kind not null,
  status public.media_status not null default 'pending',
  name text not null check (char_length(name) between 1 and 120),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  width int,
  height int,
  duration_seconds numeric,
  sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references public.profiles (id),
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'ready' or reservation_expires_at is not null)
);
create index media_assets_mosque_idx on public.media_assets (mosque_id, status);
create trigger media_assets_updated_at before update on public.media_assets
  for each row execute function public.set_updated_at();

alter table public.mosques
  add constraint mosques_logo_fk foreign key (logo_asset_id)
  references public.media_assets (id) on delete set null;

-- Storage objects awaiting deletion (keeps DB and bucket consistent).
create table public.storage_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Playlists
-- ---------------------------------------------------------------------
create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosques (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, mosque_id)
);
create index playlists_mosque_idx on public.playlists (mosque_id);
create trigger playlists_updated_at before update on public.playlists
  for each row execute function public.set_updated_at();

create table public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null,
  mosque_id uuid not null,
  media_id uuid not null references public.media_assets (id) on delete restrict,
  position int not null check (position >= 0),
  duration_seconds int not null default 10 check (duration_seconds between 3 and 3600),
  transition public.transition_effect not null default 'fade',
  transition_ms int not null default 1000 check (transition_ms between 0 and 3000),
  fit public.image_fit not null default 'contain',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (playlist_id, mosque_id) references public.playlists (id, mosque_id) on delete cascade,
  -- duration includes the transition; the transition must be shorter.
  check (transition_ms < duration_seconds * 1000)
);
create index playlist_items_playlist_idx on public.playlist_items (playlist_id, position);
create index playlist_items_media_idx on public.playlist_items (media_id);
create trigger playlist_items_updated_at before update on public.playlist_items
  for each row execute function public.set_updated_at();

-- Media used in a playlist must belong to the same mosque and be ready.
create or replace function public.playlist_items_validate()
returns trigger language plpgsql as $$
declare v_media public.media_assets%rowtype;
begin
  select * into v_media from public.media_assets where id = new.media_id;
  if not found or v_media.mosque_id <> new.mosque_id then
    raise exception 'media_not_in_mosque' using errcode = '42501';
  end if;
  if v_media.status <> 'ready' then
    raise exception 'media_not_ready' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger playlist_items_validate before insert or update of media_id, mosque_id on public.playlist_items
  for each row execute function public.playlist_items_validate();

-- Immutable published playlist snapshots.
create table public.playlist_versions (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosques (id) on delete cascade,
  playlist_id uuid references public.playlists (id) on delete set null,
  playlist_name text not null,
  version int not null,
  items jsonb not null,
  item_count int not null,
  published_by uuid references public.profiles (id),
  published_at timestamptz not null default now(),
  unique (mosque_id, version)
);

-- Snapshots and audit rows are append-only. FK cascades (depth >= 1, e.g.
-- ON DELETE SET NULL when a mosque/profile is removed) are still allowed.
create or replace function public.prevent_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is immutable', tg_table_name using errcode = '42501';
end $$;
create trigger playlist_versions_immutable before update or delete on public.playlist_versions
  for each row when (pg_trigger_depth() < 1) execute function public.prevent_mutation();

-- ---------------------------------------------------------------------
-- Display + Prayer Mode settings (draft) and publications (live)
-- ---------------------------------------------------------------------
create table public.display_settings (
  mosque_id uuid primary key references public.mosques (id) on delete cascade,
  clock_format text not null default '24h' check (clock_format in ('24h', '12h')),
  show_seconds boolean not null default true,
  show_hijri boolean not null default true,
  solat_screen_style text not null default 'message' check (solat_screen_style in ('message', 'black')),
  solat_title text not null default 'Solat Sedang Berlangsung' check (char_length(solat_title) <= 80),
  solat_subtitle text not null default 'Sila jaga ketenangan dan kekhusyukan jemaah.' check (char_length(solat_subtitle) <= 160),
  countdown_subtitle text not null default 'Sila bersedia untuk menunaikan solat.' check (char_length(countdown_subtitle) <= 160),
  updated_at timestamptz not null default now()
);
create trigger display_settings_updated_at before update on public.display_settings
  for each row execute function public.set_updated_at();

create table public.prayer_mode_settings (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosques (id) on delete cascade,
  prayer public.prayer_mode_key not null,
  enabled boolean not null default true,
  countdown_minutes int not null check (countdown_minutes between 1 and 120),
  solat_minutes int not null check (solat_minutes between 1 and 120),
  countdown_message text not null default '' check (char_length(countdown_message) <= 160),
  solat_message text not null default '' check (char_length(solat_message) <= 160),
  replaces_zohor boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (mosque_id, prayer)
);
create trigger prayer_mode_settings_updated_at before update on public.prayer_mode_settings
  for each row execute function public.set_updated_at();

create table public.mosque_publications (
  mosque_id uuid primary key references public.mosques (id) on delete cascade,
  playlist_version_id uuid references public.playlist_versions (id) on delete set null,
  prayer_mode jsonb not null,
  prayer_mode_published_at timestamptz not null default now(),
  display jsonb not null,
  display_published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger mosque_publications_updated_at before update on public.mosque_publications
  for each row execute function public.set_updated_at();

create table public.prayer_mode_overrides (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosques (id) on delete cascade,
  kind public.override_kind not null,
  prayer public.prayer_mode_key,
  starts_at timestamptz not null default now(),
  countdown_ends_at timestamptz,
  ends_at timestamptz not null,
  previous_state jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  -- Overrides always expire: maximum 3 hours.
  check (ends_at > starts_at and ends_at <= starts_at + interval '3 hours'),
  check ((kind = 'countdown') = (countdown_ends_at is not null)),
  check (countdown_ends_at is null or (countdown_ends_at > starts_at and countdown_ends_at < ends_at))
);
create index prayer_mode_overrides_mosque_idx on public.prayer_mode_overrides (mosque_id, ends_at desc);

-- ---------------------------------------------------------------------
-- Monitoring, audit, notifications, rate limiting
-- ---------------------------------------------------------------------
create table public.display_sessions (
  id uuid primary key,
  mosque_id uuid not null references public.mosques (id) on delete cascade,
  user_agent text,
  screen text,
  mode text check (mode is null or mode in ('normal', 'countdown', 'solat')),
  playlist_version int,
  schedule_ok boolean,
  last_sync_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now()
);
create index display_sessions_mosque_idx on public.display_sessions (mosque_id, last_heartbeat_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  mosque_id uuid references public.mosques (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_mosque_idx on public.audit_logs (mosque_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row when (pg_trigger_depth() < 1) execute function public.prevent_mutation();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);
