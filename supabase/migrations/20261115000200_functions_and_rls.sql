-- =====================================================================
-- WaktuSolat — authorization helpers, business functions, RLS, grants
-- =====================================================================

-- ---------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so they can read the role
-- tables without being subject to the RLS policies that call them).
-- ---------------------------------------------------------------------
create or replace function waktusolat.is_master()
returns boolean language sql stable security definer set search_path = waktusolat as $$
  select exists (select 1 from waktusolat.profiles where id = auth.uid() and role = 'master');
$$;

-- Mosque administered by the caller (active assignment + active mosque).
create or replace function waktusolat.admin_mosque_id()
returns uuid language sql stable security definer set search_path = waktusolat as $$
  select a.mosque_id
    from waktusolat.mosque_admin_assignments a
    join waktusolat.mosques m on m.id = a.mosque_id
   where a.user_id = auth.uid() and a.status = 'active' and m.status = 'active'
   limit 1;
$$;

create or replace function waktusolat.can_manage_mosque(p_mosque_id uuid)
returns boolean language sql stable security definer set search_path = waktusolat as $$
  select p_mosque_id is not null and (waktusolat.is_master() or waktusolat.admin_mosque_id() = p_mosque_id);
$$;

create or replace function waktusolat.require_manage(p_mosque_id uuid)
returns void language plpgsql stable security definer set search_path = waktusolat as $$
begin
  if not waktusolat.can_manage_mosque(p_mosque_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function waktusolat.require_master()
returns void language plpgsql stable security definer set search_path = waktusolat as $$
begin
  if not waktusolat.is_master() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Internal: audit + notifications
-- ---------------------------------------------------------------------
create or replace function waktusolat.log_audit(
  p_action text, p_mosque_id uuid, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = waktusolat as $$
  insert into waktusolat.audit_logs (mosque_id, actor_id, action, target_type, target_id, details)
  values (p_mosque_id, auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function waktusolat.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = waktusolat as $$
  insert into waktusolat.notifications (user_id, kind, title, body, link)
  values (p_user, p_kind, p_title, coalesce(p_body, ''), p_link);
$$;

create or replace function waktusolat.notify_masters(p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = waktusolat as $$
  insert into waktusolat.notifications (user_id, kind, title, body, link)
  select id, p_kind, p_title, coalesce(p_body, ''), p_link from waktusolat.profiles where role = 'master';
$$;

-- ---------------------------------------------------------------------
-- Auth integration triggers
-- ---------------------------------------------------------------------
-- New auth user -> profile, ONLY for sign-ups made by WaktuSolat
-- (raw_user_meta_data.app = 'waktusolat'). Users of other applications in
-- the same Supabase project are ignored. NEVER trust a role from metadata.
create or replace function waktusolat.handle_new_user()
returns trigger language plpgsql security definer set search_path = waktusolat as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'app', '') <> 'waktusolat' then
    return new;
  end if;
  insert into waktusolat.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 30),
    'applicant'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger waktusolat_on_auth_user_created after insert on auth.users
  for each row execute function waktusolat.handle_new_user();

-- Email verified -> application moves to pending approval + master notified.
create or replace function waktusolat.promote_verified_applications(p_user uuid, p_verified_at timestamptz)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare r record;
begin
  for r in
    update waktusolat.mosque_applications
       set status = 'pending_approval', email_verified_at = p_verified_at
     where applicant_id = p_user and status = 'pending_verification'
     returning id, mosque_name
  loop
    perform waktusolat.notify_masters('application_pending', 'Permohonan baharu',
      'Permohonan daripada ' || r.mosque_name || ' menunggu semakan.', '/master/approvals/' || r.id);
    insert into waktusolat.audit_logs (actor_id, action, target_type, target_id, details)
    values (p_user, 'application.email_verified', 'application', r.id::text, jsonb_build_object('mosque_name', r.mosque_name));
  end loop;
end $$;

create or replace function waktusolat.handle_user_email_confirmed()
returns trigger language plpgsql security definer set search_path = waktusolat as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform waktusolat.promote_verified_applications(new.id, new.email_confirmed_at);
  end if;
  return new;
end $$;

create trigger waktusolat_on_auth_user_email_confirmed after update of email_confirmed_at on auth.users
  for each row execute function waktusolat.handle_user_email_confirmed();

-- If the account is already verified when the application is inserted
-- (e.g. projects with auto-confirm), go straight to pending approval.
create or replace function waktusolat.mosque_applications_before_insert()
returns trigger language plpgsql security definer set search_path = waktusolat as $$
declare v_confirmed timestamptz;
begin
  new.status := 'pending_verification';
  select email_confirmed_at into v_confirmed from auth.users where id = new.applicant_id;
  if v_confirmed is not null then
    new.status := 'pending_approval';
    new.email_verified_at := v_confirmed;
  end if;
  return new;
end $$;
create trigger mosque_applications_before_insert before insert on waktusolat.mosque_applications
  for each row execute function waktusolat.mosque_applications_before_insert();

create or replace function waktusolat.mosque_applications_after_insert()
returns trigger language plpgsql security definer set search_path = waktusolat as $$
begin
  insert into waktusolat.audit_logs (actor_id, action, target_type, target_id, details)
  values (new.applicant_id, 'application.submitted', 'application', new.id::text,
          jsonb_build_object('mosque_name', new.mosque_name, 'zone', new.zone_code));
  if new.status = 'pending_approval' then
    perform waktusolat.notify_masters('application_pending', 'Permohonan baharu',
      'Permohonan daripada ' || new.mosque_name || ' menunggu semakan.', '/master/approvals/' || new.id);
  end if;
  return new;
end $$;
create trigger mosque_applications_after_insert after insert on waktusolat.mosque_applications
  for each row execute function waktusolat.mosque_applications_after_insert();

-- A mosque logo must be one of the mosque's own ready images.
create or replace function waktusolat.mosques_validate_logo()
returns trigger language plpgsql security definer set search_path = waktusolat as $$
begin
  if new.logo_asset_id is not null and new.logo_asset_id is distinct from old.logo_asset_id then
    if not exists (select 1 from waktusolat.media_assets where id = new.logo_asset_id and mosque_id = new.id
                   and status = 'ready' and kind = 'image') then
      raise exception 'invalid_logo' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger mosques_validate_logo before update of logo_asset_id on waktusolat.mosques
  for each row execute function waktusolat.mosques_validate_logo();

-- Defence in depth: roles can only change inside privileged functions.
create or replace function waktusolat.profiles_guard_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and current_user in ('authenticated', 'anon') then
    raise exception 'role_change_forbidden' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.email is distinct from old.email then
    if current_user in ('authenticated', 'anon') then
      raise exception 'identity_change_forbidden' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard_role before update on waktusolat.profiles
  for each row execute function waktusolat.profiles_guard_role();

-- ---------------------------------------------------------------------
-- Mosque bootstrap helpers
-- ---------------------------------------------------------------------
create or replace function waktusolat.snapshot_prayer_mode(p_mosque_id uuid)
returns jsonb language sql stable security definer set search_path = waktusolat as $$
  select coalesce(jsonb_object_agg(prayer::text, jsonb_build_object(
           'enabled', enabled,
           'countdown_minutes', countdown_minutes,
           'solat_minutes', solat_minutes,
           'countdown_message', countdown_message,
           'solat_message', solat_message,
           'replaces_zohor', replaces_zohor)), '{}'::jsonb)
    from waktusolat.prayer_mode_settings where mosque_id = p_mosque_id;
$$;

create or replace function waktusolat.snapshot_display(p_mosque_id uuid)
returns jsonb language sql stable security definer set search_path = waktusolat as $$
  select to_jsonb(d) - 'mosque_id' - 'updated_at' from waktusolat.display_settings d where mosque_id = p_mosque_id;
$$;

create or replace function waktusolat.init_mosque_defaults(p_mosque_id uuid)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare
  v_defaults jsonb;
  k text;
begin
  select default_prayer_mode into v_defaults from waktusolat.system_settings where id = 1;
  insert into waktusolat.display_settings (mosque_id) values (p_mosque_id) on conflict do nothing;
  foreach k in array array['subuh','zohor','asar','maghrib','isyak','jumaat'] loop
    insert into waktusolat.prayer_mode_settings
      (mosque_id, prayer, enabled, countdown_minutes, solat_minutes, replaces_zohor)
    values (
      p_mosque_id, k::waktusolat.prayer_mode_key,
      coalesce((v_defaults -> k ->> 'enabled')::boolean, k <> 'jumaat'),
      coalesce((v_defaults -> k ->> 'countdown_minutes')::int, 10),
      coalesce((v_defaults -> k ->> 'solat_minutes')::int, 5),
      coalesce((v_defaults -> k ->> 'replaces_zohor')::boolean, true)
    ) on conflict (mosque_id, prayer) do nothing;
  end loop;
  if not exists (select 1 from waktusolat.playlists where mosque_id = p_mosque_id) then
    insert into waktusolat.playlists (mosque_id, name) values (p_mosque_id, 'Playlist Utama');
  end if;
  insert into waktusolat.mosque_publications (mosque_id, prayer_mode, display)
  values (p_mosque_id, waktusolat.snapshot_prayer_mode(p_mosque_id), waktusolat.snapshot_display(p_mosque_id))
  on conflict (mosque_id) do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Registration review (Master only, transactional)
-- ---------------------------------------------------------------------
create or replace function waktusolat.revoke_active_admin_internal(p_mosque_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = waktusolat as $$
declare v_user uuid;
begin
  update waktusolat.mosque_admin_assignments
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
   where mosque_id = p_mosque_id and status = 'active'
   returning user_id into v_user;
  if v_user is not null then
    update waktusolat.profiles set role = 'applicant'
     where id = v_user and role = 'mosque_admin'
       and not exists (select 1 from waktusolat.mosque_admin_assignments where user_id = v_user and status = 'active');
    perform waktusolat.notify_user(v_user, 'admin_revoked', 'Akses pentadbir ditarik balik',
      coalesce(p_reason, ''), '/permohonan');
  end if;
  return v_user;
end $$;

create or replace function waktusolat.approve_application(
  p_application_id uuid,
  p_slug text,
  p_existing_mosque_id uuid default null,
  p_replace_admin boolean default false,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = waktusolat as $$
declare
  v_actor uuid := auth.uid();
  v_app waktusolat.mosque_applications%rowtype;
  v_mosque_id uuid;
  v_quota bigint;
  v_prev_admin uuid;
begin
  perform waktusolat.require_master();

  select * into v_app from waktusolat.mosque_applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if v_app.applicant_id = v_actor then
    raise exception 'self_approval_not_allowed' using errcode = '42501';
  end if;
  if v_app.status <> 'pending_approval' then
    raise exception 'invalid_application_status' using errcode = '22023';
  end if;
  if exists (select 1 from waktusolat.profiles where id = v_app.applicant_id and role = 'master') then
    raise exception 'applicant_is_master' using errcode = '42501';
  end if;
  perform 1 from waktusolat.profiles where id = v_app.applicant_id for update;
  if exists (select 1 from waktusolat.mosque_admin_assignments where user_id = v_app.applicant_id and status = 'active') then
    raise exception 'applicant_already_admin' using errcode = '23505';
  end if;

  if p_existing_mosque_id is null then
    if not waktusolat.is_valid_slug(p_slug) then
      raise exception 'invalid_slug' using errcode = '22023';
    end if;
    if exists (select 1 from waktusolat.mosques where slug = p_slug)
       or exists (select 1 from waktusolat.mosque_slug_history where old_slug = p_slug) then
      raise exception 'slug_taken' using errcode = '23505';
    end if;
    select default_storage_quota_bytes into v_quota from waktusolat.system_settings where id = 1;
    insert into waktusolat.mosques (name, slug, address, state, district, zone_code, status, storage_quota_bytes)
    values (v_app.mosque_name, p_slug, v_app.address, v_app.state, v_app.district, v_app.zone_code,
            'active', coalesce(v_quota, 104857600))
    returning id into v_mosque_id;
    perform waktusolat.init_mosque_defaults(v_mosque_id);
  else
    select id into v_mosque_id from waktusolat.mosques where id = p_existing_mosque_id for update;
    if not found then raise exception 'mosque_not_found' using errcode = 'P0002'; end if;
    select user_id into v_prev_admin from waktusolat.mosque_admin_assignments
     where mosque_id = v_mosque_id and status = 'active' for update;
    if v_prev_admin is not null then
      if not p_replace_admin then
        raise exception 'mosque_has_active_admin' using errcode = '23505';
      end if;
      perform waktusolat.revoke_active_admin_internal(v_mosque_id, 'Diganti melalui permohonan ' || p_application_id);
      perform waktusolat.log_audit('admin.replaced', v_mosque_id, 'profile', v_prev_admin::text,
        jsonb_build_object('new_admin', v_app.applicant_id, 'application_id', p_application_id));
    end if;
    perform waktusolat.init_mosque_defaults(v_mosque_id);
  end if;

  insert into waktusolat.mosque_admin_assignments (mosque_id, user_id, application_id, status, assigned_by)
  values (v_mosque_id, v_app.applicant_id, v_app.id, 'active', v_actor);

  update waktusolat.profiles set role = 'mosque_admin' where id = v_app.applicant_id;

  update waktusolat.mosque_applications
     set status = 'approved', mosque_id = v_mosque_id, reviewed_by = v_actor,
         reviewed_at = now(), master_note = p_note
   where id = v_app.id;

  perform waktusolat.notify_user(v_app.applicant_id, 'application_approved', 'Permohonan diluluskan',
    'Akaun pentadbir untuk ' || v_app.mosque_name || ' telah diaktifkan.', '/admin');
  perform waktusolat.log_audit('application.approved', v_mosque_id, 'application', v_app.id::text,
    jsonb_build_object('applicant_id', v_app.applicant_id, 'existing_mosque', p_existing_mosque_id is not null));
  return v_mosque_id;
end $$;

create or replace function waktusolat.reject_application(p_application_id uuid, p_note text)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_app waktusolat.mosque_applications%rowtype;
begin
  perform waktusolat.require_master();
  if p_note is null or char_length(trim(p_note)) < 5 then
    raise exception 'note_required' using errcode = '22023';
  end if;
  select * into v_app from waktusolat.mosque_applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if v_app.applicant_id = auth.uid() then raise exception 'self_approval_not_allowed' using errcode = '42501'; end if;
  if v_app.status not in ('pending_approval', 'info_requested', 'pending_verification') then
    raise exception 'invalid_application_status' using errcode = '22023';
  end if;
  update waktusolat.mosque_applications
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), master_note = p_note
   where id = p_application_id;
  perform waktusolat.notify_user(v_app.applicant_id, 'application_rejected', 'Permohonan ditolak', p_note, '/permohonan');
  perform waktusolat.log_audit('application.rejected', null, 'application', p_application_id::text,
    jsonb_build_object('note', p_note, 'mosque_name', v_app.mosque_name));
end $$;

create or replace function waktusolat.request_application_info(p_application_id uuid, p_note text)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_app waktusolat.mosque_applications%rowtype;
begin
  perform waktusolat.require_master();
  if p_note is null or char_length(trim(p_note)) < 5 then
    raise exception 'note_required' using errcode = '22023';
  end if;
  select * into v_app from waktusolat.mosque_applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if v_app.applicant_id = auth.uid() then raise exception 'self_approval_not_allowed' using errcode = '42501'; end if;
  if v_app.status <> 'pending_approval' then
    raise exception 'invalid_application_status' using errcode = '22023';
  end if;
  update waktusolat.mosque_applications
     set status = 'info_requested', reviewed_by = auth.uid(), reviewed_at = now(), master_note = p_note
   where id = p_application_id;
  perform waktusolat.notify_user(v_app.applicant_id, 'application_info_requested', 'Maklumat tambahan diperlukan', p_note, '/permohonan');
  perform waktusolat.log_audit('application.info_requested', null, 'application', p_application_id::text,
    jsonb_build_object('note', p_note));
end $$;

-- Applicant answers a "request more information".
create or replace function waktusolat.respond_application_info(p_application_id uuid, p_response text)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_app waktusolat.mosque_applications%rowtype;
begin
  select * into v_app from waktusolat.mosque_applications where id = p_application_id for update;
  if not found or v_app.applicant_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_app.status <> 'info_requested' then
    raise exception 'invalid_application_status' using errcode = '22023';
  end if;
  if p_response is null or char_length(trim(p_response)) < 5 or char_length(p_response) > 2000 then
    raise exception 'invalid_response' using errcode = '22023';
  end if;
  update waktusolat.mosque_applications
     set status = 'pending_approval', applicant_response = p_response
   where id = p_application_id;
  perform waktusolat.notify_masters('application_pending', 'Maklum balas pemohon',
    v_app.mosque_name || ' telah menghantar maklumat tambahan.', '/master/approvals/' || p_application_id);
  perform waktusolat.log_audit('application.info_provided', null, 'application', p_application_id::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Mosque administration (Master)
-- ---------------------------------------------------------------------
create or replace function waktusolat.set_mosque_status(p_mosque_id uuid, p_status waktusolat.mosque_status, p_reason text)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_old waktusolat.mosque_status;
begin
  perform waktusolat.require_master();
  select status into v_old from waktusolat.mosques where id = p_mosque_id for update;
  if not found then raise exception 'mosque_not_found' using errcode = 'P0002'; end if;
  update waktusolat.mosques set status = p_status, status_reason = p_reason where id = p_mosque_id;
  perform waktusolat.log_audit(case when p_status = 'suspended' then 'mosque.suspended' else 'mosque.reactivated' end,
    p_mosque_id, 'mosque', p_mosque_id::text,
    jsonb_build_object('from', v_old, 'to', p_status, 'reason', p_reason));
end $$;

create or replace function waktusolat.revoke_mosque_admin(p_mosque_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_user uuid;
begin
  perform waktusolat.require_master();
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    raise exception 'note_required' using errcode = '22023';
  end if;
  perform 1 from waktusolat.mosques where id = p_mosque_id for update;
  v_user := waktusolat.revoke_active_admin_internal(p_mosque_id, p_reason);
  if v_user is null then raise exception 'no_active_admin' using errcode = 'P0002'; end if;
  perform waktusolat.log_audit('admin.revoked', p_mosque_id, 'profile', v_user::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function waktusolat.set_mosque_quota(p_mosque_id uuid, p_bytes bigint)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_old bigint;
begin
  perform waktusolat.require_master();
  if p_bytes is null or p_bytes < 1048576 or p_bytes > 10737418240 then
    raise exception 'invalid_quota' using errcode = '22023';
  end if;
  select storage_quota_bytes into v_old from waktusolat.mosques where id = p_mosque_id for update;
  if not found then raise exception 'mosque_not_found' using errcode = 'P0002'; end if;
  update waktusolat.mosques set storage_quota_bytes = p_bytes where id = p_mosque_id;
  perform waktusolat.log_audit('storage.quota_changed', p_mosque_id, 'mosque', p_mosque_id::text,
    jsonb_build_object('from', v_old, 'to', p_bytes));
end $$;

create or replace function waktusolat.set_mosque_slug(p_mosque_id uuid, p_slug text)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_old text;
begin
  perform waktusolat.require_manage(p_mosque_id);
  if not waktusolat.is_valid_slug(p_slug) then raise exception 'invalid_slug' using errcode = '22023'; end if;
  select slug into v_old from waktusolat.mosques where id = p_mosque_id for update;
  if v_old = p_slug then return; end if;
  if exists (select 1 from waktusolat.mosques where slug = p_slug)
     or exists (select 1 from waktusolat.mosque_slug_history where old_slug = p_slug and mosque_id <> p_mosque_id) then
    raise exception 'slug_taken' using errcode = '23505';
  end if;
  delete from waktusolat.mosque_slug_history where old_slug = p_slug and mosque_id = p_mosque_id;
  insert into waktusolat.mosque_slug_history (old_slug, mosque_id) values (v_old, p_mosque_id)
    on conflict (old_slug) do nothing;
  update waktusolat.mosques set slug = p_slug where id = p_mosque_id;
  perform waktusolat.log_audit('mosque.slug_changed', p_mosque_id, 'mosque', p_mosque_id::text,
    jsonb_build_object('from', v_old, 'to', p_slug));
end $$;

-- Master-only bootstrap, executable by service_role only (see grants).
create or replace function waktusolat.bootstrap_master(p_user_id uuid)
returns void language plpgsql security definer set search_path = waktusolat as $$
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from waktusolat.mosque_admin_assignments where user_id = p_user_id and status = 'active') then
    raise exception 'user_is_mosque_admin' using errcode = '22023';
  end if;
  insert into waktusolat.profiles (id, email, role)
  select id, coalesce(email, ''), 'master' from auth.users where id = p_user_id
  on conflict (id) do update set role = 'master';
  insert into waktusolat.audit_logs (actor_id, action, target_type, target_id)
  values (p_user_id, 'master.bootstrapped', 'profile', p_user_id::text);
end $$;

-- ---------------------------------------------------------------------
-- Media: concurrency-safe quota reservation
-- ---------------------------------------------------------------------
-- Used bytes = ready assets + unexpired pending reservations.
create or replace function waktusolat.mosque_storage_used(p_mosque_id uuid)
returns bigint language sql stable security definer set search_path = waktusolat as $$
  select coalesce(sum(size_bytes), 0)::bigint from waktusolat.media_assets
   where mosque_id = p_mosque_id
     and (status = 'ready' or reservation_expires_at > now());
$$;

create or replace function waktusolat.reserve_media_upload(
  p_mosque_id uuid, p_kind waktusolat.media_kind, p_name text, p_mime text, p_size bigint, p_ext text
) returns table (asset_id uuid, storage_path text, expires_at timestamptz)
language plpgsql security definer set search_path = waktusolat as $$
#variable_conflict use_column
declare
  v_quota bigint;
  v_used bigint;
  v_settings waktusolat.system_settings%rowtype;
  v_id uuid := gen_random_uuid();
  v_path text;
  v_exp timestamptz := now() + interval '30 minutes';
begin
  perform waktusolat.require_manage(p_mosque_id);
  select * into v_settings from waktusolat.system_settings where id = 1;
  if p_size is null or p_size <= 0 then raise exception 'invalid_size' using errcode = '22023'; end if;
  if p_kind = 'image' then
    if p_mime not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'unsupported_type' using errcode = '22023'; end if;
    if p_size > v_settings.max_image_bytes then raise exception 'file_too_large' using errcode = '22023'; end if;
  else
    if p_mime <> 'video/mp4' then raise exception 'unsupported_type' using errcode = '22023'; end if;
    if p_size > v_settings.max_video_bytes then raise exception 'file_too_large' using errcode = '22023'; end if;
  end if;
  if p_ext !~ '^(jpg|jpeg|png|webp|mp4)$' then raise exception 'unsupported_type' using errcode = '22023'; end if;

  -- Serialise concurrent reservations for this mosque.
  select storage_quota_bytes into v_quota from waktusolat.mosques
   where id = p_mosque_id and status = 'active' for update;
  if not found then raise exception 'mosque_not_active' using errcode = '42501'; end if;

  v_used := waktusolat.mosque_storage_used(p_mosque_id);
  if v_used + p_size > v_quota then
    raise exception 'quota_exceeded' using errcode = '53400',
      detail = json_build_object('used', v_used, 'quota', v_quota, 'requested', p_size)::text;
  end if;

  v_path := 'mosques/' || p_mosque_id || '/media/' || v_id || '.' || p_ext;
  insert into waktusolat.media_assets (id, mosque_id, kind, status, name, storage_path, mime_type,
                                   size_bytes, uploaded_by, reservation_expires_at)
  values (v_id, p_mosque_id, p_kind, 'pending', left(coalesce(nullif(trim(p_name), ''), 'Media'), 120),
          v_path, p_mime, p_size, auth.uid(), v_exp);
  return query select v_id, v_path, v_exp;
end $$;

-- Called by the server (service_role) after validating the stored bytes.
create or replace function waktusolat.finalize_media_upload(
  p_asset_id uuid, p_actual_size bigint, p_mime text, p_width int, p_height int,
  p_duration numeric, p_sha256 text, p_metadata jsonb
) returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_asset waktusolat.media_assets%rowtype;
begin
  select * into v_asset from waktusolat.media_assets where id = p_asset_id for update;
  if not found then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  if v_asset.status = 'ready' then return; end if;
  if v_asset.reservation_expires_at < now() then raise exception 'reservation_expired' using errcode = '22023'; end if;
  if p_actual_size <= 0 or p_actual_size > v_asset.size_bytes then
    raise exception 'size_mismatch' using errcode = '22023';
  end if;
  update waktusolat.media_assets
     set status = 'ready', size_bytes = p_actual_size, mime_type = p_mime, width = p_width, height = p_height,
         duration_seconds = p_duration, sha256 = p_sha256, metadata = coalesce(p_metadata, '{}'::jsonb),
         reservation_expires_at = null
   where id = p_asset_id;
  insert into waktusolat.audit_logs (mosque_id, actor_id, action, target_type, target_id, details)
  values (v_asset.mosque_id, v_asset.uploaded_by, 'media.uploaded', 'media', p_asset_id::text,
          jsonb_build_object('name', v_asset.name, 'kind', v_asset.kind, 'size', p_actual_size));
end $$;

-- Remove a failed/abandoned reservation (service_role).
create or replace function waktusolat.discard_media_reservation(p_asset_id uuid)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_path text;
begin
  delete from waktusolat.media_assets where id = p_asset_id and status = 'pending' returning storage_path into v_path;
  if v_path is not null then
    insert into waktusolat.storage_deletion_queue (bucket, path) values ('waktusolat-media', v_path);
  end if;
end $$;

create or replace function waktusolat.cleanup_expired_reservations()
returns int language plpgsql security definer set search_path = waktusolat as $$
declare v_count int;
begin
  with gone as (
    delete from waktusolat.media_assets
     where status = 'pending' and reservation_expires_at < now() - interval '10 minutes'
     returning storage_path
  ), q as (
    insert into waktusolat.storage_deletion_queue (bucket, path) select 'waktusolat-media', storage_path from gone returning 1
  ) select count(*) into v_count from q;
  return v_count;
end $$;

create or replace function waktusolat.delete_media_asset(p_asset_id uuid)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare
  v_asset waktusolat.media_assets%rowtype;
begin
  select * into v_asset from waktusolat.media_assets where id = p_asset_id for update;
  if not found then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  perform waktusolat.require_manage(v_asset.mosque_id);
  if exists (select 1 from waktusolat.playlist_items where media_id = p_asset_id) then
    raise exception 'media_in_playlist' using errcode = '23503';
  end if;
  if exists (
    select 1 from waktusolat.mosque_publications p
      join waktusolat.playlist_versions v on v.id = p.playlist_version_id
     where p.mosque_id = v_asset.mosque_id
       and v.items @> jsonb_build_array(jsonb_build_object('media_id', p_asset_id))
  ) then
    raise exception 'media_published' using errcode = '23503';
  end if;
  update waktusolat.mosques set logo_asset_id = null where id = v_asset.mosque_id and logo_asset_id = p_asset_id;
  delete from waktusolat.media_assets where id = p_asset_id;
  insert into waktusolat.storage_deletion_queue (bucket, path) values ('waktusolat-media', v_asset.storage_path);
  perform waktusolat.log_audit('media.deleted', v_asset.mosque_id, 'media', p_asset_id::text,
    jsonb_build_object('name', v_asset.name, 'size', v_asset.size_bytes, 'kind', v_asset.kind));
end $$;

-- ---------------------------------------------------------------------
-- Publishing
-- ---------------------------------------------------------------------
create or replace function waktusolat.publish_playlist(p_playlist_id uuid)
returns int language plpgsql security definer set search_path = waktusolat as $$
declare
  v_pl waktusolat.playlists%rowtype;
  v_items jsonb;
  v_count int;
  v_version int;
  v_version_id uuid;
begin
  select * into v_pl from waktusolat.playlists where id = p_playlist_id;
  if not found then raise exception 'playlist_not_found' using errcode = 'P0002'; end if;
  perform waktusolat.require_manage(v_pl.mosque_id);
  perform 1 from waktusolat.mosques where id = v_pl.mosque_id for update;

  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'media_id', m.id, 'kind', m.kind, 'name', m.name,
           'path', m.storage_path, 'mime', m.mime_type, 'size', m.size_bytes,
           'width', m.width, 'height', m.height,
           'duration_seconds', i.duration_seconds, 'transition', i.transition,
           'transition_ms', i.transition_ms, 'fit', i.fit) order by i.position), '[]'::jsonb),
         count(*)
    into v_items, v_count
    from waktusolat.playlist_items i
    join waktusolat.media_assets m on m.id = i.media_id
   where i.playlist_id = p_playlist_id and i.is_active and m.status = 'ready';

  select coalesce(max(version), 0) + 1 into v_version from waktusolat.playlist_versions where mosque_id = v_pl.mosque_id;
  insert into waktusolat.playlist_versions (mosque_id, playlist_id, playlist_name, version, items, item_count, published_by)
  values (v_pl.mosque_id, v_pl.id, v_pl.name, v_version, v_items, v_count, auth.uid())
  returning id into v_version_id;

  update waktusolat.mosque_publications set playlist_version_id = v_version_id where mosque_id = v_pl.mosque_id;
  perform waktusolat.log_audit('playlist.published', v_pl.mosque_id, 'playlist', v_pl.id::text,
    jsonb_build_object('version', v_version, 'items', v_count, 'name', v_pl.name));
  return v_version;
end $$;

create or replace function waktusolat.publish_prayer_mode(p_mosque_id uuid)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_snap jsonb;
begin
  perform waktusolat.require_manage(p_mosque_id);
  v_snap := waktusolat.snapshot_prayer_mode(p_mosque_id);
  update waktusolat.mosque_publications
     set prayer_mode = v_snap, prayer_mode_published_at = now()
   where mosque_id = p_mosque_id;
  perform waktusolat.log_audit('prayer_mode.published', p_mosque_id, 'mosque', p_mosque_id::text, v_snap);
end $$;

create or replace function waktusolat.publish_display_settings(p_mosque_id uuid)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_snap jsonb;
begin
  perform waktusolat.require_manage(p_mosque_id);
  v_snap := waktusolat.snapshot_display(p_mosque_id);
  update waktusolat.mosque_publications
     set display = v_snap, display_published_at = now()
   where mosque_id = p_mosque_id;
  perform waktusolat.log_audit('display.published', p_mosque_id, 'mosque', p_mosque_id::text, v_snap);
end $$;

-- ---------------------------------------------------------------------
-- Manual Prayer Mode overrides
-- ---------------------------------------------------------------------
create or replace function waktusolat.create_prayer_override(
  p_mosque_id uuid,
  p_kind waktusolat.override_kind,
  p_prayer waktusolat.prayer_mode_key,
  p_countdown_minutes int,
  p_solat_minutes int,
  p_normal_minutes int default 30
) returns uuid language plpgsql security definer set search_path = waktusolat as $$
declare
  v_now timestamptz := now();
  v_prev jsonb;
  v_id uuid;
  v_cd_end timestamptz;
  v_end timestamptz;
begin
  perform waktusolat.require_manage(p_mosque_id);
  perform 1 from waktusolat.mosques where id = p_mosque_id and status = 'active' for update;
  if not found then raise exception 'mosque_not_active' using errcode = '42501'; end if;

  p_countdown_minutes := coalesce(p_countdown_minutes, 0);
  p_solat_minutes := coalesce(p_solat_minutes, 0);
  p_normal_minutes := coalesce(p_normal_minutes, 0);
  if p_kind = 'countdown' then
    if p_countdown_minutes not between 1 and 120 or p_solat_minutes not between 1 and 60 then
      raise exception 'invalid_duration' using errcode = '22023';
    end if;
    v_cd_end := v_now + make_interval(mins => p_countdown_minutes);
    v_end := v_cd_end + make_interval(mins => p_solat_minutes);
  elsif p_kind = 'solat' then
    if p_solat_minutes not between 1 and 60 then raise exception 'invalid_duration' using errcode = '22023'; end if;
    v_end := v_now + make_interval(mins => p_solat_minutes);
  else
    if p_normal_minutes not between 1 and 180 then raise exception 'invalid_duration' using errcode = '22023'; end if;
    v_end := v_now + make_interval(mins => p_normal_minutes);
  end if;

  select to_jsonb(o) - 'previous_state' into v_prev
    from waktusolat.prayer_mode_overrides o
   where mosque_id = p_mosque_id and cancelled_at is null and starts_at <= v_now and ends_at > v_now
   order by starts_at desc limit 1;

  update waktusolat.prayer_mode_overrides set cancelled_at = v_now, cancelled_by = auth.uid()
   where mosque_id = p_mosque_id and cancelled_at is null and ends_at > v_now;

  insert into waktusolat.prayer_mode_overrides
    (mosque_id, kind, prayer, starts_at, countdown_ends_at, ends_at, previous_state, created_by)
  values (p_mosque_id, p_kind, p_prayer, v_now, v_cd_end, v_end, v_prev, auth.uid())
  returning id into v_id;

  perform waktusolat.log_audit('override.created', p_mosque_id, 'override', v_id::text,
    jsonb_build_object('kind', p_kind, 'prayer', p_prayer, 'starts_at', v_now,
                       'countdown_ends_at', v_cd_end, 'ends_at', v_end, 'previous', v_prev));
  return v_id;
end $$;

create or replace function waktusolat.clear_prayer_override(p_mosque_id uuid)
returns int language plpgsql security definer set search_path = waktusolat as $$
declare v_count int;
begin
  perform waktusolat.require_manage(p_mosque_id);
  update waktusolat.prayer_mode_overrides set cancelled_at = now(), cancelled_by = auth.uid()
   where mosque_id = p_mosque_id and cancelled_at is null and ends_at > now();
  get diagnostics v_count = row_count;
  perform waktusolat.log_audit('override.cleared', p_mosque_id, 'override', null, jsonb_build_object('count', v_count));
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Public display payload — the ONLY public read path.
-- Returns published data for an active mosque, nothing else.
-- ---------------------------------------------------------------------
create or replace function waktusolat.get_public_display(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = waktusolat as $$
declare
  v_m waktusolat.mosques%rowtype;
  v_pub waktusolat.mosque_publications%rowtype;
  v_pl waktusolat.playlist_versions%rowtype;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_redirect text;
  v_logo text;
begin
  if p_slug is null or char_length(p_slug) > 60 then return null; end if;
  select * into v_m from waktusolat.mosques where slug = lower(p_slug);
  if not found then
    select m.slug into v_redirect from waktusolat.mosque_slug_history h
      join waktusolat.mosques m on m.id = h.mosque_id
     where h.old_slug = lower(p_slug) and m.status = 'active';
    if v_redirect is not null then return jsonb_build_object('redirect', v_redirect); end if;
    return null;
  end if;
  if v_m.status <> 'active' then
    return jsonb_build_object('unavailable', true);
  end if;
  select * into v_pub from waktusolat.mosque_publications where mosque_id = v_m.id;
  if v_pub.playlist_version_id is not null then
    select * into v_pl from waktusolat.playlist_versions where id = v_pub.playlist_version_id;
  end if;
  select storage_path into v_logo from waktusolat.media_assets where id = v_m.logo_asset_id and status = 'ready';

  return jsonb_build_object(
    'mosque', jsonb_build_object('id', v_m.id, 'name', v_m.name, 'slug', v_m.slug,
                                 'zone', v_m.zone_code, 'district', v_m.district, 'state', v_m.state,
                                 'logo_path', v_logo),
    'playlist', case when v_pl.id is null then null else jsonb_build_object(
                  'version', v_pl.version, 'published_at', v_pl.published_at, 'items', v_pl.items) end,
    'prayer_mode', coalesce(v_pub.prayer_mode, '{}'::jsonb),
    'prayer_mode_published_at', v_pub.prayer_mode_published_at,
    'display', coalesce(v_pub.display, '{}'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'kind', o.kind, 'prayer', o.prayer, 'starts_at', o.starts_at,
               'countdown_ends_at', o.countdown_ends_at,
               'ends_at', least(o.ends_at, coalesce(o.cancelled_at, o.ends_at))) order by o.starts_at)
        from waktusolat.prayer_mode_overrides o
       where o.mosque_id = v_m.id
         and least(o.ends_at, coalesce(o.cancelled_at, o.ends_at)) > now() - interval '6 hours'
         and least(o.ends_at, coalesce(o.cancelled_at, o.ends_at)) > o.starts_at), '[]'::jsonb),
    'schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', s.date, 'hijri', s.hijri_date,
               'subuh', to_char(s.subuh, 'HH24:MI'), 'syuruk', to_char(s.syuruk, 'HH24:MI'),
               'zohor', to_char(s.zohor, 'HH24:MI'), 'asar', to_char(s.asar, 'HH24:MI'),
               'maghrib', to_char(s.maghrib, 'HH24:MI'), 'isyak', to_char(s.isyak, 'HH24:MI'),
               'source', s.source, 'fetched_at', s.fetched_at) order by s.date)
        from waktusolat.prayer_schedules s
       where s.zone_code = v_m.zone_code and s.date between v_today - 1 and v_today + 7), '[]'::jsonb),
    'server_time', now()
  );
end $$;

-- ---------------------------------------------------------------------
-- Storage + dashboard summaries
-- ---------------------------------------------------------------------
create or replace function waktusolat.get_storage_summary(p_mosque_id uuid default null)
returns table (
  mosque_id uuid, mosque_name text, slug text, quota_bytes bigint, used_bytes bigint,
  image_bytes bigint, video_bytes bigint, image_count bigint, video_count bigint, pending_bytes bigint
) language sql stable security definer set search_path = waktusolat as $$
  select m.id, m.name, m.slug, m.storage_quota_bytes,
         coalesce(sum(a.size_bytes) filter (where a.status = 'ready' or a.reservation_expires_at > now()), 0)::bigint,
         coalesce(sum(a.size_bytes) filter (where a.status = 'ready' and a.kind = 'image'), 0)::bigint,
         coalesce(sum(a.size_bytes) filter (where a.status = 'ready' and a.kind = 'video'), 0)::bigint,
         count(a.id) filter (where a.status = 'ready' and a.kind = 'image'),
         count(a.id) filter (where a.status = 'ready' and a.kind = 'video'),
         coalesce(sum(a.size_bytes) filter (where a.status = 'pending' and a.reservation_expires_at > now()), 0)::bigint
    from waktusolat.mosques m
    left join waktusolat.media_assets a on a.mosque_id = m.id
   where (p_mosque_id is null or m.id = p_mosque_id)
     and waktusolat.can_manage_mosque(m.id)
   group by m.id
   order by m.name;
$$;

-- DB-backed fixed-window rate limiter (service_role only).
create or replace function waktusolat.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = waktusolat as $$
declare v_count int;
begin
  insert into waktusolat.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_max;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table waktusolat.prayer_zones enable row level security;
alter table waktusolat.system_settings enable row level security;
alter table waktusolat.profiles enable row level security;
alter table waktusolat.mosques enable row level security;
alter table waktusolat.mosque_slug_history enable row level security;
alter table waktusolat.mosque_applications enable row level security;
alter table waktusolat.mosque_admin_assignments enable row level security;
alter table waktusolat.prayer_schedules enable row level security;
alter table waktusolat.prayer_fetch_log enable row level security;
alter table waktusolat.media_assets enable row level security;
alter table waktusolat.storage_deletion_queue enable row level security;
alter table waktusolat.playlists enable row level security;
alter table waktusolat.playlist_items enable row level security;
alter table waktusolat.playlist_versions enable row level security;
alter table waktusolat.display_settings enable row level security;
alter table waktusolat.prayer_mode_settings enable row level security;
alter table waktusolat.mosque_publications enable row level security;
alter table waktusolat.prayer_mode_overrides enable row level security;
alter table waktusolat.display_sessions enable row level security;
alter table waktusolat.audit_logs enable row level security;
alter table waktusolat.notifications enable row level security;
alter table waktusolat.rate_limits enable row level security;

-- Start from zero privileges, then grant precisely.
revoke all on all tables in schema waktusolat from anon, authenticated;
revoke all on all sequences in schema waktusolat from anon, authenticated;
revoke execute on all functions in schema waktusolat from public, anon, authenticated;

-- Reference data (public)
grant select on waktusolat.prayer_zones to anon, authenticated;
create policy prayer_zones_read on waktusolat.prayer_zones for select using (true);
grant select on waktusolat.prayer_schedules to anon, authenticated;
create policy prayer_schedules_read on waktusolat.prayer_schedules for select using (true);

-- System settings: readable by signed-in users, writable by master.
grant select, update on waktusolat.system_settings to authenticated;
create policy system_settings_read on waktusolat.system_settings for select to authenticated using (true);
create policy system_settings_write on waktusolat.system_settings for update to authenticated
  using (waktusolat.is_master()) with check (waktusolat.is_master());

-- Profiles: self or master. Only name/phone are user-editable.
grant select on waktusolat.profiles to authenticated;
grant update (full_name, phone) on waktusolat.profiles to authenticated;
create policy profiles_read on waktusolat.profiles for select to authenticated
  using (id = auth.uid() or waktusolat.is_master());
create policy profiles_update_self on waktusolat.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Mosques
grant select on waktusolat.mosques to authenticated;
grant update (name, address, state, district, zone_code, logo_asset_id) on waktusolat.mosques to authenticated;
create policy mosques_read on waktusolat.mosques for select to authenticated
  using (waktusolat.is_master() or id = waktusolat.admin_mosque_id());
create policy mosques_update on waktusolat.mosques for update to authenticated
  using (waktusolat.can_manage_mosque(id)) with check (waktusolat.can_manage_mosque(id));

grant select on waktusolat.mosque_slug_history to authenticated;
create policy slug_history_read on waktusolat.mosque_slug_history for select to authenticated
  using (waktusolat.can_manage_mosque(mosque_id));

-- Applications: applicant (own) or master. Writes via functions/server only.
grant select on waktusolat.mosque_applications to authenticated;
create policy applications_read on waktusolat.mosque_applications for select to authenticated
  using (applicant_id = auth.uid() or waktusolat.is_master());

grant select on waktusolat.mosque_admin_assignments to authenticated;
create policy assignments_read on waktusolat.mosque_admin_assignments for select to authenticated
  using (user_id = auth.uid() or waktusolat.is_master());

grant select on waktusolat.prayer_fetch_log to authenticated;
create policy fetch_log_read on waktusolat.prayer_fetch_log for select to authenticated using (true);

-- Media: tenant scoped. Insert/delete through functions; rename allowed.
grant select on waktusolat.media_assets to authenticated;
grant update (name) on waktusolat.media_assets to authenticated;
create policy media_read on waktusolat.media_assets for select to authenticated
  using (waktusolat.can_manage_mosque(mosque_id));
create policy media_update on waktusolat.media_assets for update to authenticated
  using (waktusolat.can_manage_mosque(mosque_id)) with check (waktusolat.can_manage_mosque(mosque_id));

-- Playlists + items: full tenant CRUD.
grant select, insert, update, delete on waktusolat.playlists to authenticated;
create policy playlists_all on waktusolat.playlists for all to authenticated
  using (waktusolat.can_manage_mosque(mosque_id)) with check (waktusolat.can_manage_mosque(mosque_id));
grant select, insert, update, delete on waktusolat.playlist_items to authenticated;
create policy playlist_items_all on waktusolat.playlist_items for all to authenticated
  using (waktusolat.can_manage_mosque(mosque_id)) with check (waktusolat.can_manage_mosque(mosque_id));

grant select on waktusolat.playlist_versions to authenticated;
create policy playlist_versions_read on waktusolat.playlist_versions for select to authenticated
  using (waktusolat.can_manage_mosque(mosque_id));

grant select, update (clock_format, show_seconds, show_hijri, solat_screen_style, solat_title, solat_subtitle, countdown_subtitle)
  on waktusolat.display_settings to authenticated;
create policy display_settings_rw on waktusolat.display_settings for all to authenticated
  using (waktusolat.can_manage_mosque(mosque_id)) with check (waktusolat.can_manage_mosque(mosque_id));

grant select, update (enabled, countdown_minutes, solat_minutes, countdown_message, solat_message, replaces_zohor)
  on waktusolat.prayer_mode_settings to authenticated;
create policy prayer_mode_settings_rw on waktusolat.prayer_mode_settings for all to authenticated
  using (waktusolat.can_manage_mosque(mosque_id)) with check (waktusolat.can_manage_mosque(mosque_id));

grant select on waktusolat.mosque_publications to authenticated;
create policy publications_read on waktusolat.mosque_publications for select to authenticated
  using (waktusolat.can_manage_mosque(mosque_id));

grant select on waktusolat.prayer_mode_overrides to authenticated;
create policy overrides_read on waktusolat.prayer_mode_overrides for select to authenticated
  using (waktusolat.can_manage_mosque(mosque_id));

grant select on waktusolat.display_sessions to authenticated;
create policy display_sessions_read on waktusolat.display_sessions for select to authenticated
  using (waktusolat.can_manage_mosque(mosque_id));

-- Audit logs: read-only; master sees all, mosque admin sees own mosque.
grant select on waktusolat.audit_logs to authenticated;
create policy audit_read on waktusolat.audit_logs for select to authenticated
  using (waktusolat.is_master() or (mosque_id is not null and mosque_id = waktusolat.admin_mosque_id()));

grant select, update (read_at) on waktusolat.notifications to authenticated;
create policy notifications_read on waktusolat.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on waktusolat.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- storage_deletion_queue, rate_limits: no policies -> service_role only.

-- ---------------------------------------------------------------------
-- Function execute grants
-- ---------------------------------------------------------------------
grant execute on function waktusolat.get_public_display(text) to anon, authenticated;
grant execute on function waktusolat.is_master() to authenticated;
grant execute on function waktusolat.admin_mosque_id() to authenticated;
grant execute on function waktusolat.can_manage_mosque(uuid) to authenticated;
grant execute on function waktusolat.is_valid_slug(text) to anon, authenticated;
grant execute on function waktusolat.is_reserved_slug(text) to anon, authenticated;
grant execute on function waktusolat.approve_application(uuid, text, uuid, boolean, text) to authenticated;
grant execute on function waktusolat.reject_application(uuid, text) to authenticated;
grant execute on function waktusolat.request_application_info(uuid, text) to authenticated;
grant execute on function waktusolat.respond_application_info(uuid, text) to authenticated;
grant execute on function waktusolat.set_mosque_status(uuid, waktusolat.mosque_status, text) to authenticated;
grant execute on function waktusolat.revoke_mosque_admin(uuid, text) to authenticated;
grant execute on function waktusolat.set_mosque_quota(uuid, bigint) to authenticated;
grant execute on function waktusolat.set_mosque_slug(uuid, text) to authenticated;
grant execute on function waktusolat.mosque_storage_used(uuid) to authenticated;
grant execute on function waktusolat.reserve_media_upload(uuid, waktusolat.media_kind, text, text, bigint, text) to authenticated;
grant execute on function waktusolat.delete_media_asset(uuid) to authenticated;
grant execute on function waktusolat.publish_playlist(uuid) to authenticated;
grant execute on function waktusolat.publish_prayer_mode(uuid) to authenticated;
grant execute on function waktusolat.publish_display_settings(uuid) to authenticated;
grant execute on function waktusolat.create_prayer_override(uuid, waktusolat.override_kind, waktusolat.prayer_mode_key, int, int, int) to authenticated;
grant execute on function waktusolat.clear_prayer_override(uuid) to authenticated;
grant execute on function waktusolat.get_storage_summary(uuid) to authenticated;
-- Trigger/RLS plumbing must remain callable inside policies & triggers.
grant execute on function waktusolat.set_updated_at() to authenticated;
grant execute on function waktusolat.playlist_items_validate() to authenticated;
grant execute on function waktusolat.profiles_guard_role() to authenticated;
grant execute on function waktusolat.prevent_mutation() to authenticated;

-- service_role-only operations
grant execute on function waktusolat.bootstrap_master(uuid) to service_role;
grant execute on function waktusolat.finalize_media_upload(uuid, bigint, text, int, int, numeric, text, jsonb) to service_role;
grant execute on function waktusolat.discard_media_reservation(uuid) to service_role;
grant execute on function waktusolat.cleanup_expired_reservations() to service_role;
grant execute on function waktusolat.check_rate_limit(text, int, int) to service_role;
grant execute on function waktusolat.get_public_display(text) to service_role;
grant all on all tables in schema waktusolat to service_role;
grant all on all sequences in schema waktusolat to service_role;
