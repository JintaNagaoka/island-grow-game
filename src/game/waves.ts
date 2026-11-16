import { BEAT_MS, FARM_WORK_MS, PLANT_WAVE_BEATS, SPLIT_WAVE_MS, TRUE_WAVE_BEATS, WAVE_DURATIONS_MS } from './timing';
import {
  SECOND_RESIDENT_ID,
  THIRD_RESIDENT_ID,
  VILLAGE_RESIDENT_IDS,
  addResidents,
  moveResident,
  revealPlantStage,
  revealProp,
  settleFirstResidentAtFire,
  settleSecondResidentAtPlot,
  startSecondResidentWalking,
  type PropId,
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
  | 'animal-eats'
  // Turn 3 (🪨)
  | 'farm-matures'
  | 'farm-blossoms'
  | 'workshop-appears'
  | 'human-divides'
  | 'human-walks-to-workshop'
  | 'human-gathers-stone'
  | 'human-carries-stone'
  | 'human-builds-hut'
  | 'furnace-lights'
  | 'cave-furnished'
  | 'livestock-fenced'
  | 'livestock-breeds'
  | 'riverbed-dug'
  // Turn 4 (💧)
  | 'spring-appears'
  | 'river-flows'
  | 'water-carried'
  | 'village-gathers'
  | 'village-built'
  | 'ecosystem-flourishes'
  | 'shrine-appears'
  // Epilogue
  | 'epilogue-growth'
  | 'true-judged'
  | 'guardian-transforms';

// A Wave is one timed step of an Event. Its effect on the VISIBLE world is applied
// by game logic when the Wave's logical duration elapses, never by an animation
// callback. It reveals what the Rule Engine already resolved; it cannot read or
// change the authoritative RuleState.
export interface Wave {
  readonly id: WaveId;
  readonly durationMs: number;
  readonly complete: (world: WorldState) => WorldState;
  // The Rule Engine Event this Wave presents (Turn 3, Turn 4 and Epilogue Waves).
  // The Wave plays only when the turn's resolved Events contain it, and a turn's
  // Waves follow the order its Events were resolved in.
  readonly event?: string;
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
// the plant plot (sprouts, then saplings: plantStage 2, once the farm-expands Wave completes), the shelter→hut, fire→cooking fire and animal→cared-for level-ups;
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
    // The composite farm-work art hands over to the plant plot: sprouts (plant stage 1)
    // grow in and then become saplings (stage 2), the two plant Events of Turn 2
    // (plant-introduced, plant-tended). The visible plant is stage 2 once this completes.
    id: 'farm-expands',
    durationMs: beats(PLANT_WAVE_BEATS.farmExpands),
    complete: (world) => revealPlantStage(world, 2),
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

const reveal =
  (...ids: readonly PropId[]) =>
  (world: WorldState): WorldState =>
    ids.reduce(revealProp, world);

// Turn 3 (🪨 after 🔥 → 🌱). Every Wave presents one resolved Rule Event, in the
// order the Rule Engine produced them. The third resident does the transient work;
// durable props are revealed when the Wave that builds them completes.
//
// Who does the work, and where each resident stands when a Wave ends, is Presentation's
// concern (crew.ts); the `place` set here is only the visible mirror of it, so the next
// Wave starts where the last one left the resident. Waves present the plant Events that
// raise the plant (plant-fruits, plant-spreads) so the plot shows each Stage it reaches.
export const ROCK_WAVES: readonly Wave[] = [
  { id: 'farm-matures', event: 'plant-fruits', durationMs: beats(TRUE_WAVE_BEATS.farmMatures), complete: (world) => revealPlantStage(world, 3) },
  {
    // An existing resident (the first, from the fire) walks to the site and builds the workshop;
    // the workshop stands once the building work has finished, and the work stops there. The
    // third resident has not divided off yet (human-divides follows), so it cannot be the builder.
    id: 'workshop-appears',
    event: 'stone-workbench',
    durationMs: beats(TRUE_WAVE_BEATS.workshopAppears),
    complete: reveal('stone-workshop'),
  },
  {
    id: 'human-divides',
    event: 'human-division',
    durationMs: SPLIT_WAVE_MS + beats(TRUE_WAVE_BEATS.humanDivides),
    complete: (world) => addResidents(world, [THIRD_RESIDENT_ID], 'fire'),
  },
  {
    id: 'human-walks-to-workshop',
    event: 'stone-building',
    durationMs: beats(TRUE_WAVE_BEATS.humanWalksToWorkshop),
    complete: (world) => moveResident(world, THIRD_RESIDENT_ID, 'workshop'),
  },
  { id: 'human-gathers-stone', event: 'stone-building', durationMs: beats(TRUE_WAVE_BEATS.humanGathersStone), complete: (world) => world },
  {
    id: 'human-carries-stone',
    event: 'homes-built',
    durationMs: beats(TRUE_WAVE_BEATS.humanCarriesStone),
    complete: (world) => moveResident(world, THIRD_RESIDENT_ID, 'hut-site'),
  },
  { id: 'human-builds-hut', event: 'homes-built', durationMs: beats(TRUE_WAVE_BEATS.humanBuildsHut), complete: reveal('second-hut') },
  {
    // The furnace is built beside the workshop and stays: the Rule Engine's furnace-built
    // result is the visible 'furnace' prop, revealed when this Wave completes.
    id: 'furnace-lights',
    event: 'furnace-built',
    durationMs: beats(TRUE_WAVE_BEATS.furnaceLights),
    complete: (world) => moveResident(reveal('furnace')(world), THIRD_RESIDENT_ID, 'furnace'),
  },
  { id: 'farm-blossoms', event: 'plant-spreads', durationMs: beats(TRUE_WAVE_BEATS.farmBlossoms), complete: (world) => revealPlantStage(world, 4) },
  {
    // The second resident walks from the plot to the cave, goes in, works inside and comes
    // out; the cave's furnishings appear after that work.
    id: 'cave-furnished',
    event: 'cave-furnished',
    durationMs: beats(TRUE_WAVE_BEATS.caveFurnished),
    complete: (world) => moveResident(reveal('practical-cave')(world), SECOND_RESIDENT_ID, 'cave'),
  },
  {
    id: 'livestock-fenced',
    event: 'fence-built',
    durationMs: beats(TRUE_WAVE_BEATS.livestockFenced),
    // The empty bucket is the animal's water basin: dry, because no freshwater exists yet.
    // The second resident, back from the cave, is at the plot again.
    complete: (world) =>
      moveResident(
        moveResident(reveal('fence', 'feed-area', 'empty-bucket', 'livestock-parent')(world), THIRD_RESIDENT_ID, 'pen'),
        SECOND_RESIDENT_ID,
        'plot',
      ),
  },
  { id: 'livestock-breeds', event: 'animal-family', durationMs: beats(TRUE_WAVE_BEATS.livestockBreeds), complete: reveal('livestock-child') },
  {
    id: 'riverbed-dug',
    event: 'channel-dug',
    durationMs: beats(TRUE_WAVE_BEATS.riverbedDug),
    complete: (world) => moveResident(reveal('dry-riverbed')(world), THIRD_RESIDENT_ID, 'riverbed'),
  },
];

// Turn 4 (💧) followed by the Epilogue. The Epilogue Waves present events the Rule
// Engine has already resolved; the guardian Wave plays only because TRUE succeeded.
export const WATER_WAVES: readonly Wave[] = [
  { id: 'spring-appears', event: 'water-introduced', durationMs: beats(TRUE_WAVE_BEATS.springAppears), complete: reveal('spring-pond') },
  { id: 'river-flows', event: 'channel-flows', durationMs: beats(TRUE_WAVE_BEATS.riverFlows), complete: reveal('flowing-riverbed') },
  {
    id: 'water-carried',
    event: 'water-carried',
    durationMs: beats(TRUE_WAVE_BEATS.waterCarried),
    complete: (world) => moveResident(reveal('filled-bucket')(world), THIRD_RESIDENT_ID, 'pen'),
  },
  {
    id: 'village-gathers',
    event: 'human-society',
    durationMs: beats(TRUE_WAVE_BEATS.villageGathers),
    complete: (world) => addResidents(world, VILLAGE_RESIDENT_IDS, 'village'),
  },
  {
    // The added homes are built by the new residents: each walks to its home, works, and
    // the home stands once it has. They end where they work.
    id: 'village-built',
    event: 'village-built',
    durationMs: beats(TRUE_WAVE_BEATS.villageBuilt),
    complete: (world) =>
      moveResident(
        moveResident(moveResident(reveal('village-homes')(world), VILLAGE_RESIDENT_IDS[0], 'home-a'), VILLAGE_RESIDENT_IDS[1], 'home-b'),
        VILLAGE_RESIDENT_IDS[2],
        'workshop',
      ),
  },
  { id: 'ecosystem-flourishes', event: 'ecosystem-flourishes', durationMs: beats(TRUE_WAVE_BEATS.ecosystemFlourishes), complete: (world) => revealPlantStage(world, 5) },
  {
    // The second resident walks to the cave, goes in and works; the exterior becomes the
    // shrine afterwards and the resident comes out. (The cave Stage rises with `cave-shrine`.)
    id: 'shrine-appears',
    event: 'cave-shrine',
    durationMs: beats(TRUE_WAVE_BEATS.shrineAppears),
    complete: (world) => moveResident(reveal('shrine')(world), SECOND_RESIDENT_ID, 'cave'),
  },
  {
    // The Epilogue Growth pass. The second resident walks back from the cave to the plot.
    id: 'epilogue-growth',
    event: 'epilogue-growth',
    durationMs: beats(TRUE_WAVE_BEATS.epilogueGrowth),
    complete: (world) => moveResident(world, SECOND_RESIDENT_ID, 'plot'),
  },
  { id: 'true-judged', event: 'ending-true', durationMs: beats(TRUE_WAVE_BEATS.trueJudged), complete: (world) => world },
  { id: 'guardian-transforms', event: 'guardian-transformed', durationMs: beats(TRUE_WAVE_BEATS.guardianTransforms), complete: reveal('guardians') },
];
