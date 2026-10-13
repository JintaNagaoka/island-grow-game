// Authoritative game state. Pure data: no Phaser, no timing, no rendering.
export const ELEMENTS = ['fire', 'plant', 'rock', 'water'] as const;
export type Element = (typeof ELEMENTS)[number];

// Named places a resident can be at or head for. Pixel positions belong to
// Presentation; the game only knows which place a resident is in.
export type ResidentPlace = 'start' | 'fire' | 'plot' | 'cave' | 'workshop';
export type ResidentMotion = 'idle' | 'walking';

// One member of the population: a stable unique id plus the durable state its
// behaviour is derived from. Not a general entity: only what the approved turns need.
export interface Resident {
  readonly id: string;
  readonly place: ResidentPlace;
  // The place the resident is heading for while walking, otherwise null.
  readonly target: ResidentPlace | null;
  readonly motion: ResidentMotion;
}

export interface WorldState {
  readonly turn: number;
  readonly selectedElements: readonly Element[];
  // 0: no fire. 1: the campfire. 2: it has levelled up into a cooking fire (Turn 2).
  readonly fireStage: number;
  // 0: no plot. 1: Turn 2 sprout plot. 2: Turn 3 mature continuous farm.
  readonly plantStage: number;
  // 1: the rain shelter the island starts with. 2: it has levelled up into a hut.
  readonly shelterStage: number;
  // 1: wild animal. 2: cared for in Turn 2. 3: domesticated parent/child family in Turn 3.
  readonly animalStage: number;
  // Turn 3 development facts. These stay separate: none is inferred from an
  // animation or from another stage merely being visible.
  readonly stoneStage: number;
  readonly caveStage: number;
  readonly riverStage: number;
  readonly dwellingCount: number;
  readonly animalCount: number;
  readonly livestockFacilitiesStage: number;
  readonly humanStage: number;
  // Always equals residents.length.
  readonly population: number;
  readonly residents: readonly Resident[];
  readonly isCold: boolean;
}

export const FIRST_RESIDENT_ID = 'resident-1';
export const SECOND_RESIDENT_ID = 'resident-2';
export const THIRD_RESIDENT_ID = 'resident-3';

export function createInitialWorldState(): WorldState {
  return {
    turn: 0,
    selectedElements: [],
    fireStage: 0,
    plantStage: 0,
    shelterStage: 1,
    animalStage: 1,
    stoneStage: 0,
    caveStage: 0,
    riverStage: 0,
    dwellingCount: 1,
    animalCount: 1,
    livestockFacilitiesStage: 0,
    humanStage: 1,
    population: 1,
    residents: [{ id: FIRST_RESIDENT_ID, place: 'start', target: null, motion: 'idle' }],
    isCold: true,
  };
}

const updateResident = (
  world: WorldState,
  id: string,
  change: Partial<Omit<Resident, 'id'>>,
): WorldState => ({
  ...world,
  residents: world.residents.map((resident) => (resident.id === id ? { ...resident, ...change } : resident)),
});

// Turn 1: the resident has walked to the fire and stays there.
export const settleFirstResidentAtFire = (world: WorldState): WorldState =>
  updateResident(world, FIRST_RESIDENT_ID, { place: 'fire', target: null, motion: 'idle' });

// Turn 2 start: the population splits, once. Both residents stand at the fire;
// resident 1 keeps waiting there. Re-applying it changes nothing.
export function splitResident(world: WorldState): WorldState {
  if (world.residents.some((resident) => resident.id === SECOND_RESIDENT_ID)) return world;
  const residents: readonly Resident[] = [
    ...world.residents,
    { id: SECOND_RESIDENT_ID, place: 'fire', target: null, motion: 'idle' },
  ];
  return { ...world, humanStage: 2, population: residents.length, residents };
}

// Turn 3 start: the third resident appears once at the established plot. The
// subsequent Waves move it through the cave gathering site to the workshop;
// population is never derived from presentation objects.
export function addThirdResident(world: WorldState): WorldState {
  if (world.residents.some((resident) => resident.id === THIRD_RESIDENT_ID)) return world;
  const residents: readonly Resident[] = [
    ...world.residents,
    { id: THIRD_RESIDENT_ID, place: 'plot', target: null, motion: 'idle' },
  ];
  return { ...world, humanStage: 3, population: residents.length, residents };
}

export const startThirdResidentWalking = (world: WorldState): WorldState =>
  updateResident(world, THIRD_RESIDENT_ID, { target: 'cave', motion: 'walking' });

export const settleThirdResidentAtCave = (world: WorldState): WorldState =>
  updateResident(world, THIRD_RESIDENT_ID, { place: 'cave', target: null, motion: 'idle' });

export const settleThirdResidentAtWorkshop = (world: WorldState): WorldState =>
  updateResident(world, THIRD_RESIDENT_ID, { place: 'workshop', target: null, motion: 'idle' });

// The split has finished: resident 2 sets off for the plot.
export const startSecondResidentWalking = (world: WorldState): WorldState =>
  updateResident(world, SECOND_RESIDENT_ID, { target: 'plot', motion: 'walking' });

// Resident 2 has reached the plot.
export const settleSecondResidentAtPlot = (world: WorldState): WorldState =>
  updateResident(world, SECOND_RESIDENT_ID, { place: 'plot', target: null, motion: 'idle' });

// Semantic questions about the world. Rules and Presentation ask these instead
// of comparing stage numbers, so a stage's meaning lives in one place.
export const hasSproutPlot = (world: WorldState): boolean => world.plantStage >= 1;
export const hasUpgradedHut = (world: WorldState): boolean => world.shelterStage >= 2;
export const hasCookingFire = (world: WorldState): boolean => world.fireStage >= 2;
export const hasCaredForAnimal = (world: WorldState): boolean => world.animalStage >= 2;
export const hasMatureFarm = (world: WorldState): boolean => world.plantStage >= 2;
export const hasStoneWorkshop = (world: WorldState): boolean => world.stoneStage >= 1;
export const hasPracticalCave = (world: WorldState): boolean => world.caveStage >= 1;
export const hasDryRiverbed = (world: WorldState): boolean => world.riverStage >= 1;
export const hasSecondDwelling = (world: WorldState): boolean => world.dwellingCount >= 2;
export const hasDomesticLivestockFamily = (world: WorldState): boolean =>
  world.animalStage >= 3 && world.animalCount >= 2;
export const hasLivestockFacilities = (world: WorldState): boolean =>
  world.livestockFacilitiesStage >= 1;
