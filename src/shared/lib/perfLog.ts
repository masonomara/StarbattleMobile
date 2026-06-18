// Lightweight performance instrumentation for diagnosing JS-thread stalls.
//
// WHY THIS EXISTS: the prefetch *download* path streams to disk off the JS
// thread, but reading those files back (rnfs.readFile + JSON.parse of a
// multi-MB hints/pack file) and the preview-cache path (fetchFromSupabase +
// JSON.parse) still run synchronously on the JS thread. When a puzzle opens
// while prefetch is in flight, that work can pin the thread and block taps,
// draws, and rendering. This module makes those costs visible and timestamped
// so a stall can be correlated to the exact operation that caused it.
//
// Output is gated on PERF_ENABLED. Normally __DEV__ so logs are stripped from
// release builds. Temporarily flip to `true` to capture release-build timings
// (the real ones — dev inflates them); revert before merging so these logs never
// ship to production users.
import { track, TELEMETRY_ENABLED } from './telemetry';

const PERF_ENABLED = __DEV__;

// Stalls over this go to telemetry as js_stall in production. Higher than the
// console THRESHOLD_MS below: dev wants to see every 80ms blip, but as a
// fleet-wide signal we only care about freezes a user actually feels.
const STALL_TELEMETRY_MS = 500;

// Module-load time ≈ app launch. Shared epoch so every line is comparable and
// can be cross-referenced against [SB:STARTUP] lines (loaded within ms of this).
const EPOCH = Date.now();

function now(): number {
  return Date.now() - EPOCH;
}

function fmt(ms: number): string {
  return `+${ms}ms`;
}

// One-shot event marker. tag groups related lines (e.g. 'HINTS', 'PREFETCH').
export function mark(tag: string, msg: string): void {
  if (!PERF_ENABLED) return;
  console.log(`[SB:${tag}] ${fmt(now())} ${msg}`);
}

// Times a synchronous-or-async span. Returns an end() that logs the duration.
// Pass a size/count via the end() arg to annotate the line (e.g. file KB).
//
// HOT flag: only spans the caller declares `sync: true` (pure JS-thread CPU,
// e.g. a JSON.parse) get the ⚠ JS-THREAD HOT marker when they run ≥100ms —
// for those the wall-clock duration IS the thread-block time. For an async span
// the duration is wall-clock that includes I/O waits and says NOTHING about
// thread blockage (a 2s streamed download never touches the thread), so flagging
// it HOT is a false alarm. The [SB:STALL] watchdog is the authoritative freeze
// signal for async work; don't infer freezes from these durations.
export function time(
  tag: string,
  label: string,
  opts?: { sync?: boolean },
): (extra?: string) => number {
  if (!PERF_ENABLED) return () => 0;
  const start = now();
  return (extra?: string) => {
    const dur = now() - start;
    const hot = opts?.sync && dur >= 100 ? '  ⚠ JS-THREAD HOT' : '';
    console.log(
      `[SB:${tag}] ${fmt(start)} ${label} took ${dur}ms${extra ? ` (${extra})` : ''}${hot}`,
    );
    return dur;
  };
}

// JS-thread stall watchdog. A timer scheduled every INTERVAL_MS can only fire
// on the JS thread; if the thread is blocked, the callback is delayed by the
// blockage duration. Measuring (actual gap - scheduled gap) yields how long the
// thread was unavailable — i.e. how long gameplay input/rendering was frozen.
// Logs every stall over THRESHOLD_MS with a timestamp so it can be lined up
// against the operation logs above.
const INTERVAL_MS = 100;
const THRESHOLD_MS = 80; // ignore normal scheduler jitter; report real blocks
let watchHandle: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;
let worstStall = 0;

export function startStallWatch(): void {
  // Runs whenever EITHER the dev console OR production telemetry consumes stalls.
  // In release PERF_ENABLED is false but the watchdog must still run to feed
  // js_stall telemetry — the timer is cheap (a 100ms tick + a subtraction).
  if (watchHandle || (!PERF_ENABLED && !TELEMETRY_ENABLED)) return;
  if (PERF_ENABLED) {
    // Loud, unmistakable confirmation that this (new) bundle is running — if you
    // don't see this line, the build is stale and none of the other logs are real.
    console.log('[SB:PERF] ===== perfLog instrumentation ACTIVE =====');
  }
  lastTick = now();
  worstStall = 0;
  watchHandle = setInterval(() => {
    const t = now();
    const gap = t - lastTick;
    lastTick = t;
    const stall = gap - INTERVAL_MS;
    if (stall <= THRESHOLD_MS) return;
    if (stall > worstStall) worstStall = stall;
    if (PERF_ENABLED) {
      console.log(
        `[SB:STALL] ${fmt(t)} JS thread blocked ~${stall}ms (worst so far ${worstStall}ms)`,
      );
    }
    // Fleet signal: only freezes a user actually feels.
    if (stall > STALL_TELEMETRY_MS) track('js_stall', { duration_ms: stall });
  }, INTERVAL_MS);
  mark('STALL', 'watchdog started');
}
