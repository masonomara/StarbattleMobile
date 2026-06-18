-- Performance + engagement telemetry, single event-stream table.
-- Every metric (p95 hint-load by version, stall rate, fallback frequency,
-- completion rate, retention) is a SQL query over this table. Clients only
-- INSERT; reads happen via the service role (SQL editor / dashboard).

create table if not exists public.perf_events (
  id            bigint generated always as identity primary key,
  ts            timestamptz not null default now(),
  anon_user_id  uuid not null,
  session_id    text not null,
  app_version   text,
  platform      text,
  event         text not null,
  duration_ms   integer,
  value         numeric,
  meta          jsonb
);

-- Query shapes: filter/group by event + time, slice by app_version, retention by user.
create index if not exists perf_events_event_ts_idx on public.perf_events (event, ts desc);
create index if not exists perf_events_version_idx  on public.perf_events (app_version);
create index if not exists perf_events_user_idx     on public.perf_events (anon_user_id);

alter table public.perf_events enable row level security;

-- Clients may INSERT only their own telemetry (authenticated = anonymous or
-- signed-in user). Requiring anon_user_id = auth.uid() stops one user writing
-- as another and stops unauthenticated writes.
drop policy if exists "perf_events insert own" on public.perf_events;
create policy "perf_events insert own"
  on public.perf_events for insert to authenticated
  with check (anon_user_id = (select auth.uid()));

-- No SELECT/UPDATE/DELETE policy: with RLS enabled, reads/edits are denied to
-- clients by default. Telemetry is write-only from the app.
