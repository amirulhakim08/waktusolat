-- Audit changes to global system settings.
create or replace function waktusolat.system_settings_audit()
returns trigger language plpgsql security definer set search_path = waktusolat as $$
begin
  insert into waktusolat.audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'system.settings_updated', 'system_settings', '1',
          jsonb_build_object('default_storage_quota_bytes', new.default_storage_quota_bytes,
                             'max_video_bytes', new.max_video_bytes));
  return new;
end $$;
create trigger system_settings_audit after update on waktusolat.system_settings
  for each row execute function waktusolat.system_settings_audit();
