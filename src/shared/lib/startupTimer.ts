const LAUNCH_TIME = Date.now();

// Milliseconds since the JS bundle loaded (≈ app launch). Used by telemetry's
// app_start event to report time-to-interactive.
export function msSinceLaunch(): number {
  return Date.now() - LAUNCH_TIME;
}

export const startupTimer = {
  log(milestone: string): void {
    console.log(`[SB:STARTUP] +${msSinceLaunch()}ms ${milestone}`);
  },
};
