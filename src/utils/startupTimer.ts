const LAUNCH_TIME = Date.now();

export const startupTimer = {
  log(milestone: string): void {
    const delta = Date.now() - LAUNCH_TIME;
    console.log(`[STARTUP] +${delta}ms ${milestone}`);
  },
};
