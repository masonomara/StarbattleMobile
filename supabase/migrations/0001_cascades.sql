-- Guarantee ON DELETE CASCADE from auth.users to every user-scoped table so that
-- public.delete_user() and the anon-merge cleanup remove all dependent rows.
-- Self-discovering and idempotent: drops whatever auth.users FK currently exists
-- on each table (by its real name) and re-adds a single cascade FK. streak_archive
-- is intentionally excluded — it is global and has no user_id column.

do $$
declare
  t text;
  c text;
begin
  foreach t in array array['puzzle_progress', 'streaks', 'user_entitlements'] loop
    for c in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = t
        and con.contype = 'f'
        and con.confrelid = 'auth.users'::regclass
    loop
      execute format('alter table public.%I drop constraint %I', t, c);
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (user_id) '
      || 'references auth.users(id) on delete cascade',
      t, t || '_user_id_fkey'
    );
  end loop;
end $$;
