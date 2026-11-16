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

// Turn 3 (🪨), Turn 4 (💧) and the Epilogue Waves are also laid out in beats of the
// 97 BPM design tempo (logical milliseconds at 1x). All values are provisional: the
// pacing is a human play-review decision.
//
// Autonomous work is shown as real travel and work at the approved walking speed, so a
// Wave that includes a walk is at least as long as that walk plus its work (crew.ts
// builds each routine from the layout's distances; crew.test.ts checks every routine
// fits its Wave). The long ones are the cave trips (the resident walks from the plot to
// the cave entrance, goes in, works and comes out) and the village build (the new
// residents walk to the homes, fetch stone and build). Independent work of different
// residents runs in parallel inside one Wave instead of adding Waves.
export const TRUE_WAVE_BEATS = {
  // Turn 3
  farmMatures: 2.5,
  // An existing resident walks to the site, builds the workshop, and walks back.
  workshopAppears: 6,
  humanDivides: 1, // the split pop; SPLIT_WAVE_MS is used for the shake itself
  humanWalksToWorkshop: 3,
  humanGathersStone: 3,
  humanCarriesStone: 2,
  humanBuildsHut: 3.5,
  furnaceLights: 3.5,
  farmBlossoms: 2.5,
  caveFurnished: 7,
  livestockFenced: 6,
  livestockBreeds: 2.5,
  riverbedDug: 8,
  // Turn 4
  springAppears: 2.5,
  riverFlows: 3,
  waterCarried: 7.5,
  villageGathers: 2.5,
  villageBuilt: 7,
  ecosystemFlourishes: 3,
  shrineAppears: 7,
  // Epilogue
  epilogueGrowth: 4,
  trueJudged: 2.5,
  guardianTransforms: 4,
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
