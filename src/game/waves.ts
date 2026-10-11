import { BEAT_MS, PLANT_WAVE_BEATS, WAVE_DURATIONS_MS } from './timing';
import type { WorldState } from './worldState';

export type WaveId =
  | 'fire-appears'
  | 'human-notices-and-approaches'
  | 'human-warms-up'
  | 'human-walks-to-plot'
  | 'sprout-plot-appears'
  | 'human-waters-plot'
  | 'human-harvests-plot'
  | 'shelter-levels-up'
  | 'cooking-starts'
  | 'animal-eats';

// A Wave is one timed step of an Event. Its WorldState effect is applied by
// game logic when the Wave's logical duration elapses, never by an animation
// callback.
export interface Wave {
  readonly id: WaveId;
  readonly durationMs: number;
  readonly complete: (world: WorldState) => WorldState;
}

// Vertical Slice 01: the fire event. Order here is the playback order.
export const FIRE_WARMING_WAVES: readonly Wave[] = [
  {
    id: 'fire-appears',
    durationMs: WAVE_DURATIONS_MS.fireAppears,
    complete: (world) => ({ ...world, fireStage: 1 }),
  },
  {
    // The human notices the fire and walks to it. No persistent state changes.
    id: 'human-notices-and-approaches',
    durationMs: WAVE_DURATIONS_MS.humanNoticesAndApproaches,
    complete: (world) => world,
  },
  {
    id: 'human-warms-up',
    durationMs: WAVE_DURATIONS_MS.humanWarmsUp,
    complete: (world) => ({ ...world, isCold: false }),
  },
];

const beats = (count: number): number => Math.round(count * BEAT_MS);

// Turn 2: the plant event (🌱 after Turn 1). Only the plot and the shelter
// level-up are persistent WorldState; the farm work, cooking and feeding Waves
// are presentation beats whose order the Wave sequence itself guarantees.
// Population stays 1 and nothing else (animal count, fences, ponds) changes.
export const PLANT_LIFE_WAVES: readonly Wave[] = [
  {
    // The human walks from the fire to the plot site. No persistent change.
    id: 'human-walks-to-plot',
    durationMs: beats(PLANT_WAVE_BEATS.humanWalksToPlot),
    complete: (world) => world,
  },
  {
    id: 'sprout-plot-appears',
    durationMs: beats(PLANT_WAVE_BEATS.sproutPlotAppears),
    complete: (world) => ({ ...world, plantStage: 1 }),
  },
  {
    id: 'human-waters-plot',
    durationMs: beats(PLANT_WAVE_BEATS.humanWatersPlot),
    complete: (world) => world,
  },
  {
    id: 'human-harvests-plot',
    durationMs: beats(PLANT_WAVE_BEATS.humanHarvestsPlot),
    complete: (world) => world,
  },
  {
    // The rain shelter develops into a hut.
    id: 'shelter-levels-up',
    durationMs: beats(PLANT_WAVE_BEATS.shelterLevelsUp),
    complete: (world) => ({ ...world, shelterStage: 2 }),
  },
  {
    id: 'cooking-starts',
    durationMs: beats(PLANT_WAVE_BEATS.cookingStarts),
    complete: (world) => world,
  },
  {
    id: 'animal-eats',
    durationMs: beats(PLANT_WAVE_BEATS.animalEats),
    complete: (world) => world,
  },
];
