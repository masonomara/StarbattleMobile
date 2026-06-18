import { Platform } from 'react-native';
import { supabase } from './supabase';
import { useAuthStore } from '../stores/authStore';
import { APP_VERSION } from './config';

// Batching telemetry sink for perf, engagement, and conversion events. track() is
// cheap and synchronous (just enqueues); the network insert is batched and
// fire-and-forget so telemetry never competes with gameplay or throws into the
// app. Every metric is a SQL query over the perf_events table.
//
// Sends only from release builds so dev/testing never pollutes the prod table.
// Flip TELEMETRY_ENABLED to true temporarily to verify the pipeline from a dev
// build (events print to console either way in __DEV__); revert before commit.
export const TELEMETRY_ENABLED = !__DEV__;

export type PerfEventName =
  // perf
  | 'app_start' // launch → first frame painted (bootsplash hidden); meta.cold, meta.route
  | 'puzzle_open' // puzzle tap → board isReady
  | 'hint_load' // hints fetch; meta.source disk|download|fallback, value=KB
  | 'js_stall' // JS-thread freeze > threshold; duration_ms = block length
  | 'error' // failure events; meta.kind
  // engagement
  | 'puzzle_complete' // solve; duration_ms = solve time, meta.hints_used etc.
  | 'hint_used' // user revealed a hint; meta.puzzle_id, difficulty, band, hint_number, step
  | 'streak_play' // tap to start a streak challenge; meta.type daily|weekly|monthly
  | 'streak_recorded' // streak advanced on completion; meta.type, current, best
  | 'pack_complete' // final puzzle of a non-streak pack solved; meta.pack, puzzle_count
  // discovery / conversion funnels
  | 'streak_archive_view' // archive screen opened; meta.type, is_premium
  | 'streak_archive_gate' // non-premium hit the archive paywall; meta.type
  | 'paywall_shown' // paywall surfaced; meta.context sequential|paid-pack|unavailable, pack
  | 'purchase_initiated' // user committed to buy; meta.kind premium|pack, product_id, pack
  | 'purchase_result'; // outcome; duration_ms, meta.kind, outcome success|failed|cancelled|lag, reason

type EventFields = {
  duration_ms?: number;
  value?: number;
  meta?: Record<string, unknown>;
};

type QueuedEvent = EventFields & { ts: string; event: PerfEventName };

// New session id per cold start (this module loads once per process). Not a uuid
// — session_id is a text column; this is unique enough to group a launch's events.
const SESSION_ID = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2, 10)}`;

const MAX_BATCH = 20; // flush when the queue reaches this many events
const FLUSH_MS = 10_000; // ...or this long after the first queued event
const MAX_QUEUE = 200; // hard cap so a persistently-offline device can't grow unbounded

// Per-event sampling. At this app's volume everything is 100%; lower the rate
// for high-frequency events if row volume ever becomes a cost. Failures and
// stalls should stay at 1 — they're rare and high-value.
const SAMPLE_RATES: Record<PerfEventName, number> = {
  app_start: 1,
  puzzle_open: 1,
  hint_load: 1,
  js_stall: 1,
  error: 1,
  puzzle_complete: 1,
  hint_used: 1,
  streak_play: 1,
  streak_recorded: 1,
  pack_complete: 1,
  streak_archive_view: 1,
  streak_archive_gate: 1,
  paywall_shown: 1,
  purchase_initiated: 1,
  purchase_result: 1,
};

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function armTimer(): void {
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flush();
    }, FLUSH_MS);
  }
}

export function track(event: PerfEventName, fields?: EventFields): void {
  if (__DEV__) console.log(`[SB:TELEMETRY] ${event}`, fields ?? '');
  if (!TELEMETRY_ENABLED) return;
  if (Math.random() > (SAMPLE_RATES[event] ?? 1)) return;

  queue.push({ ts: new Date().toISOString(), event, ...fields });
  // Drop oldest if we've backed up (offline) so memory stays bounded.
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);

  if (queue.length >= MAX_BATCH) flush();
  else armTimer();
}

// Sends the queued batch. Best-effort: on any failure the batch is dropped (no
// retry loop, which could pile up and compete with gameplay). Safe to call from
// AppState background to avoid losing events on suspend.
export async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;

  // RLS requires the row's anon_user_id to equal the caller. Before anon sign-in
  // resolves we can't satisfy it — keep the events queued and retry on the next
  // flush rather than dropping them.
  const anonUserId = useAuthStore.getState().user?.id ?? null;
  if (!anonUserId) {
    armTimer();
    return;
  }

  const batch = queue;
  queue = [];
  const rows = batch.map(e => ({
    ts: e.ts,
    anon_user_id: anonUserId,
    session_id: SESSION_ID,
    app_version: APP_VERSION,
    platform: Platform.OS,
    event: e.event,
    duration_ms: e.duration_ms ?? null,
    value: e.value ?? null,
    meta: e.meta ?? null,
  }));

  try {
    const { error } = await supabase.from('perf_events').insert(rows);
    if (error) throw error;
  } catch {
    // Swallow: telemetry must never surface to the user or retry-loop.
  }
}
