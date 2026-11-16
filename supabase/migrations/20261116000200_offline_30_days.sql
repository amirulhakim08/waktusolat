-- Offline resilience: public displays receive 30 days of prayer times
-- (was 7) so a TV keeps working through a long internet outage.

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
     where t.mosque_id = v_m.id and t.date between v_today - 1 and v_today + 30;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'date', s.date, 'hijri', s.hijri_date,
             'subuh', to_char(s.subuh, 'HH24:MI'), 'syuruk', to_char(s.syuruk, 'HH24:MI'),
             'zohor', to_char(s.zohor, 'HH24:MI'), 'asar', to_char(s.asar, 'HH24:MI'),
             'maghrib', to_char(s.maghrib, 'HH24:MI'), 'isyak', to_char(s.isyak, 'HH24:MI'),
             'source', s.source, 'fetched_at', s.fetched_at) order by s.date), '[]'::jsonb)
      into v_schedules
      from waktusolat.prayer_schedules s
     where s.zone_code = v_m.zone_code and s.date between v_today - 1 and v_today + 30;
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
