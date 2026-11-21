-- Lege rollen zoals in Supabase, zodat policies (bijv. "to authenticated") bij de hersteltest terugkomen.
-- Alleen voor de lokale herstel-database; geen rechten, geen login.
do $$
declare r text;
begin
  foreach r in array array[
    'anon', 'authenticated', 'service_role', 'authenticator', 'supabase_admin', 'supabase_auth_admin',
    'supabase_storage_admin', 'supabase_functions_admin', 'supabase_realtime_admin', 'supabase_replication_admin',
    'supabase_read_only_user', 'dashboard_user', 'pgbouncer', 'pgsodium_keyholder', 'pgsodium_keyiduser',
    'pgsodium_keymaker', 'supabase_etl_admin', 'backup_reader'
  ] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;
