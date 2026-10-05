// The single timing boundary. Wave durations are expressed in logical
// milliseconds at 1x playback; a global playback speed scales real elapsed
// time into logical time here and nowhere else. Presentation must animate from
// the logical clock/progress it is given instead of using its own timers.
export const DEFAULT_PLAYBACK_SPEED = 1;

// Initial tuning targets ~6.8s from the fire tap to "ready" (Issue target: 5-8s).
// Final values are a human play-review decision.
export const WAVE_DURATIONS_MS = {
  fireAppears: 1400,
  humanNoticesAndApproaches: 3200,
  humanWarmsUp: 2200,
} as const;

// Upper bound on one frame's real delta so a backgrounded tab does not skip
// the whole sequence in a single update.
export const MAX_FRAME_DELTA_MS = 100;

export function assertValidPlaybackSpeed(speed: number): void {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new RangeError(`playback speed must be a positive finite number: ${speed}`);
  }
}

export function toLogicalDeltaMs(realDeltaMs: number, playbackSpeed: number): number {
  if (!Number.isFinite(realDeltaMs) || realDeltaMs < 0) {
    throw new RangeError(`delta must be a non-negative finite number: ${realDeltaMs}`);
  }
  assertValidPlaybackSpeed(playbackSpeed);
  return realDeltaMs * playbackSpeed;
}
