-- Minimal emulation of the Supabase platform objects the migrations
-- depend on, so they can be tested against a plain PostgreSQL server.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);

-- Simulate ANOTHER application already living in the same Supabase project:
-- same table names in `public`, its own auth trigger and a `media` bucket.
-- WaktuSolat's migrations must install alongside without touching these.
create table if not exists public.profiles (id uuid primary key references auth.users (id) on delete cascade, username text);
create table if not exists public.notifications (id serial primary key, message text);
create or replace function public.other_app_new_user() returns trigger language plpgsql as $$
begin
  insert into public.profiles (id, username) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.other_app_new_user();
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict do nothing;
