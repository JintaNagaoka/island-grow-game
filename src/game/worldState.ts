// Authoritative game state. Pure data: no Phaser, no timing, no rendering.
export const ELEMENTS = ['fire', 'plant', 'rock', 'water'] as const;
export type Element = (typeof ELEMENTS)[number];

// Named places a resident can be at or head for. Pixel positions belong to
// Presentation; the game only knows which place a resident is in.
export type ResidentPlace = 'start' | 'fire' | 'plot';
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
  // 0: no plot. 1: the Turn 2 sprout plot exists (the expanded farm, once its Wave completes).
  readonly plantStage: number;
  // 1: the rain shelter the island starts with. 2: it has levelled up into a hut.
  readonly shelterStage: number;
  // 1: the wild animal the island starts with. 2: it is being fed (Turn 2). Still one animal.
  readonly animalStage: number;
  readonly humanStage: number;
  // Always equals residents.length.
  readonly population: number;
  readonly residents: readonly Resident[];
  readonly isCold: boolean;
}

export const FIRST_RESIDENT_ID = 'resident-1';
export const SECOND_RESIDENT_ID = 'resident-2';

export function createInitialWorldState(): WorldState {
  return {
    turn: 0,
    selectedElements: [],
    fireStage: 0,
    plantStage: 0,
    shelterStage: 1,
    animalStage: 1,
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
