-- Make user_entitlements replicate to PowerSync. It was in the client AppSchema
-- (and App.tsx watches it) but was never added to Postgres logical replication,
-- so the row never reached the device and isPremium stayed false on the client.
--
-- NOTE: this only covers the Postgres half. PowerSync's sync rules (dashboard)
-- must also include user_entitlements in the per-user bucket's data queries.

-- PowerSync needs full row images to replicate updates/deletes correctly.
alter table public.user_entitlements replica identity full;

-- Add to the PowerSync publication when it manages an explicit table list and
-- doesn't already include this table. No-op for FOR ALL TABLES publications or
-- if no publication named "powersync" exists.
do $$
begin
  if exists (
       select 1 from pg_publication
       where pubname = 'powersync' and puballtables = false
     )
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'powersync'
         and schemaname = 'public'
         and tablename = 'user_entitlements'
     )
  then
    alter publication powersync add table public.user_entitlements;
  end if;
end $$;
