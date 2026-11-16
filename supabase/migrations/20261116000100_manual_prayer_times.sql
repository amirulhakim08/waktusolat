-- =====================================================================
-- Manual prayer times (e.g. offshore platforms not covered by a JAKIM
-- zone). A mosque chooses its source:
--   'jakim'  -> official e-Solat schedule for its zone (default)
--   'manual' -> times keyed in by the mosque administrator per date
-- The public display marks manual times as such; the Hijri date still
-- comes from the mosque's JAKIM zone when available.
-- =====================================================================

alter table waktusolat.mosques
  add column prayer_time_source text not null default 'jakim'
  check (prayer_time_source in ('jakim', 'manual'));

grant update (prayer_time_source) on waktusolat.mosques to authenticated;

create table waktusolat.manual_prayer_times (
  mosque_id uuid not null references waktusolat.mosques (id) on delete cascade,
  date date not null,
  subuh time not null,
  syuruk time not null,
  zohor time not null,
  asar time not null,
  maghrib time not null,
  isyak time not null,
  updated_by uuid references waktusolat.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (mosque_id, date),
  check (subuh < syuruk and syuruk < zohor and zohor < asar and asar < maghrib and maghrib < isyak)
);

alter table waktusolat.manual_prayer_times enable row level security;
grant select on waktusolat.manual_prayer_times to authenticated;
create policy manual_prayer_times_read on waktusolat.manual_prayer_times for select to authenticated
  using (waktusolat.can_manage_mosque(mosque_id));
grant all on waktusolat.manual_prayer_times to service_role;

-- Bulk upsert, e.g. [{"date":"2026-11-17","subuh":"05:50",...}, ...]
create or replace function waktusolat.upsert_manual_prayer_times(p_mosque_id uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = waktusolat as $$
declare
  v_count int;
begin
  perform waktusolat.require_manage(p_mosque_id);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 400 then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  insert into waktusolat.manual_prayer_times
    (mosque_id, date, subuh, syuruk, zohor, asar, maghrib, isyak, updated_by, updated_at)
  select p_mosque_id, (r ->> 'date')::date,
         (r ->> 'subuh')::time, (r ->> 'syuruk')::time, (r ->> 'zohor')::time,
         (r ->> 'asar')::time, (r ->> 'maghrib')::time, (r ->> 'isyak')::time,
         auth.uid(), now()
    from jsonb_array_elements(p_rows) r
  on conflict (mosque_id, date) do update
    set subuh = excluded.subuh, syuruk = excluded.syuruk, zohor = excluded.zohor,
        asar = excluded.asar, maghrib = excluded.maghrib, isyak = excluded.isyak,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  get diagnostics v_count = row_count;
  perform waktusolat.log_audit('prayer_times.manual_saved', p_mosque_id, 'mosque', p_mosque_id::text,
    jsonb_build_object('days', v_count,
                       'from', (select min((r ->> 'date')::date) from jsonb_array_elements(p_rows) r),
                       'to', (select max((r ->> 'date')::date) from jsonb_array_elements(p_rows) r)));
  return v_count;
end $$;

create or replace function waktusolat.delete_manual_prayer_times(p_mosque_id uuid, p_from date, p_to date)
returns int language plpgsql security definer set search_path = waktusolat as $$
declare v_count int;
begin
  perform waktusolat.require_manage(p_mosque_id);
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  delete from waktusolat.manual_prayer_times where mosque_id = p_mosque_id and date between p_from and p_to;
  get diagnostics v_count = row_count;
  perform waktusolat.log_audit('prayer_times.manual_deleted', p_mosque_id, 'mosque', p_mosque_id::text,
    jsonb_build_object('days', v_count, 'from', p_from, 'to', p_to));
  return v_count;
end $$;

create or replace function waktusolat.set_prayer_time_source(p_mosque_id uuid, p_source text)
returns void language plpgsql security definer set search_path = waktusolat as $$
declare v_old text;
begin
  perform waktusolat.require_manage(p_mosque_id);
  if p_source not in ('jakim', 'manual') then raise exception 'invalid_source' using errcode = '22023'; end if;
  select prayer_time_source into v_old from waktusolat.mosques where id = p_mosque_id for update;
  if v_old = p_source then return; end if;
  update waktusolat.mosques set prayer_time_source = p_source where id = p_mosque_id;
  perform waktusolat.log_audit('prayer_times.source_changed', p_mosque_id, 'mosque', p_mosque_id::text,
    jsonb_build_object('from', v_old, 'to', p_source));
end $$;

revoke execute on function waktusolat.upsert_manual_prayer_times(uuid, jsonb) from public, anon;
revoke execute on function waktusolat.delete_manual_prayer_times(uuid, date, date) from public, anon;
revoke execute on function waktusolat.set_prayer_time_source(uuid, text) from public, anon;
grant execute on function waktusolat.upsert_manual_prayer_times(uuid, jsonb) to authenticated;
grant execute on function waktusolat.delete_manual_prayer_times(uuid, date, date) to authenticated;
grant execute on function waktusolat.set_prayer_time_source(uuid, text) to authenticated;

-- Public payload: schedules come from the chosen source.
create or replace function waktusolat.get_public_display(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = waktusolat as $$
declare
  v_m waktusolat.mosques%rowtype;
  v_pub waktusolat.mosque_publications%rowtype;
  v_pl waktusolat.playlist_versions%rowtype;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_redirect text;
  v_logo text;
  v_schedules jsonb;
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

  if v_m.prayer_time_source = 'manual' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'date', t.date, 'hijri', s.hijri_date,
             'subuh', to_char(t.subuh, 'HH24:MI'), 'syuruk', to_char(t.syuruk, 'HH24:MI'),
             'zohor', to_char(t.zohor, 'HH24:MI'), 'asar', to_char(t.asar, 'HH24:MI'),
             'maghrib', to_char(t.maghrib, 'HH24:MI'), 'isyak', to_char(t.isyak, 'HH24:MI'),
             'source', 'manual', 'fetched_at', t.updated_at) order by t.date), '[]'::jsonb)
      into v_schedules
      from waktusolat.manual_prayer_times t
      left join waktusolat.prayer_schedules s on s.zone_code = v_m.zone_code and s.date = t.date
     where t.mosque_id = v_m.id and t.date between v_today - 1 and v_today + 7;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'date', s.date, 'hijri', s.hijri_date,
             'subuh', to_char(s.subuh, 'HH24:MI'), 'syuruk', to_char(s.syuruk, 'HH24:MI'),
             'zohor', to_char(s.zohor, 'HH24:MI'), 'asar', to_char(s.asar, 'HH24:MI'),
             'maghrib', to_char(s.maghrib, 'HH24:MI'), 'isyak', to_char(s.isyak, 'HH24:MI'),
             'source', s.source, 'fetched_at', s.fetched_at) order by s.date), '[]'::jsonb)
      into v_schedules
      from waktusolat.prayer_schedules s
     where s.zone_code = v_m.zone_code and s.date between v_today - 1 and v_today + 7;
  end if;

  return jsonb_build_object(
    'mosque', jsonb_build_object('id', v_m.id, 'name', v_m.name, 'slug', v_m.slug,
                                 'zone', v_m.zone_code, 'district', v_m.district, 'state', v_m.state,
                                 'logo_path', v_logo, 'prayer_time_source', v_m.prayer_time_source),
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
    'schedules', v_schedules,
    'server_time', now()
  );
end $$;
