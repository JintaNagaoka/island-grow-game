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

// Turn 2 Waves are laid out in beats of the 97 BPM design tempo, expressed in
// logical milliseconds like every other duration here. Final values are a human
// play-review decision.
export const BEAT_MS = 60_000 / 97;
export const PLANT_WAVE_BEATS = {
  humanWalksToPlot: 3.5,
  farmExpands: 3,
  shelterLevelsUp: 2.5,
  cookingStarts: 1.5,
  animalEats: 2.5,
} as const;

// The Turn 2 opening split (ぷるぷる → ポンッ) at the fire, in logical milliseconds.
// Notion does not define these numbers. Human Review approved 600 ms together with
// the 2.5 px / 9 Hz shake and 0.6x pop on Cloudflare Pages on 2026-10-12.
export const SPLIT_WAVE_MS = 600;

// The two farm-work poses are specified in seconds, not beats: water1 for exactly
// 1.5 s, then harvest2 for exactly 1.5 s (logical milliseconds at 1x).
export const FARM_WORK_MS = {
  humanWatersPlot: 1500,
  humanHarvestsPlot: 1500,
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
