import { BEAT_MS, FARM_WORK_MS, PLANT_WAVE_BEATS, SPLIT_WAVE_MS, WAVE_DURATIONS_MS } from './timing';
import {
  settleFirstResidentAtFire,
  settleSecondResidentAtPlot,
  startSecondResidentWalking,
  type WorldState,
} from './worldState';

export type WaveId =
  | 'human-splits'
  | 'fire-appears'
  | 'human-notices-and-approaches'
  | 'human-warms-up'
  | 'human-walks-to-plot'
  | 'human-waters-plot'
  | 'human-harvests-plot'
  | 'farm-expands'
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
    // The human notices the fire and walks to it; the resident ends up at the fire.
    id: 'human-notices-and-approaches',
    durationMs: WAVE_DURATIONS_MS.humanNoticesAndApproaches,
    complete: settleFirstResidentAtFire,
  },
  {
    id: 'human-warms-up',
    durationMs: WAVE_DURATIONS_MS.humanWarmsUp,
    complete: (world) => ({ ...world, isCold: false }),
  },
];

const beats = (count: number): number => Math.round(count * BEAT_MS);

// Turn 2: the plant event (🌱 after Turn 1). The persistent WorldState changes are
// the sprout plot (plantStage 1, once the farm has grown in), the shelter→hut, fire→cooking fire and animal→cared-for level-ups;
// the walk and farm-work Waves are presentation beats whose order the Wave sequence
// itself guarantees. The population split (1 -> 2) happens at Turn 2 start (splitResident) and nothing else (animal count, fences,
// ponds) changes.
export const PLANT_LIFE_WAVES: readonly Wave[] = [
  {
    // The split level-up at the fire. The population is already 2 (splitResident, at
    // the accepted selection); both residents stay at the fire until this Wave
    // completes, when resident 2 starts walking to the plot.
    id: 'human-splits',
    durationMs: SPLIT_WAVE_MS,
    complete: startSecondResidentWalking,
  },
  {
    // Resident 2 (split off at Turn 2 start) walks from the fire to the plot site while
    // resident 1 keeps waiting at the fire. It has arrived when this Wave completes.
    id: 'human-walks-to-plot',
    durationMs: beats(PLANT_WAVE_BEATS.humanWalksToPlot),
    complete: settleSecondResidentAtPlot,
  },
  {
    // water1 continuously, exactly 1.5 s. No persistent change.
    id: 'human-waters-plot',
    durationMs: FARM_WORK_MS.humanWatersPlot,
    complete: (world) => world,
  },
  {
    // harvest2 continuously, exactly 1.5 s.
    id: 'human-harvests-plot',
    durationMs: FARM_WORK_MS.humanHarvestsPlot,
    complete: (world) => world,
  },
  {
    // Settle on harvest1 while standalone plot tiles grow in, one after another, to
    // the final farm. The sprout plot (plantStage 1) is established, once, when it completes.
    id: 'farm-expands',
    durationMs: beats(PLANT_WAVE_BEATS.farmExpands),
    complete: (world) => ({ ...world, plantStage: 1 }),
  },
  {
    // The rain shelter develops into a hut.
    id: 'shelter-levels-up',
    durationMs: beats(PLANT_WAVE_BEATS.shelterLevelsUp),
    complete: (world) => ({ ...world, shelterStage: 2 }),
  },
  {
    // The campfire levels up into a cooking fire (the same fire, not a second one).
    id: 'cooking-starts',
    durationMs: beats(PLANT_WAVE_BEATS.cookingStarts),
    complete: (world) => ({ ...world, fireStage: 2 }),
  },
  {
    // The one animal levels up from wild to cared-for. No second animal, fence or breeding.
    id: 'animal-eats',
    durationMs: beats(PLANT_WAVE_BEATS.animalEats),
    complete: (world) => ({ ...world, animalStage: 2 }),
  },
];
