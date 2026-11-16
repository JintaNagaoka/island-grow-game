// The visible world: what Presentation shows at this moment. It is revealed one
// Wave at a time and is NOT the gameplay authority. The authoritative state is the
// RuleState resolved synchronously at selection (see rules/engine.ts); Wave
// completion only reveals it, and nothing here can change a gameplay outcome.
// A test (visibleWorld.test.ts) pins what this must equal once playback ends.
export const ELEMENTS = ['fire', 'plant', 'rock', 'water'] as const;
export type Element = (typeof ELEMENTS)[number];

// Named places a resident can be at or head for. Pixel positions belong to
// Presentation; the game only knows which place a resident is in.
export type ResidentPlace =
  | 'start'
  | 'fire'
  | 'plot'
  // Turn 3 / Turn 4 working places and the settlement.
  | 'workshop'
  | 'hut-site'
  | 'riverbed'
  | 'pen'
  | 'village'
  // Turn 3 / Turn 4 places added for the division of labour: beside the finished
  // furnace, in front of the cave entrance, and at the two added homes.
  | 'furnace'
  | 'cave'
  | 'home-a'
  | 'home-b';
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

// Durable props revealed after Turn 2 by Turn 3 / Turn 4 / Epilogue Waves. The meaning
// of each (dry riverbed vs flowing, empty vs filled bucket) is decided by Presentation
// from which ids are present, never by comparing numbers.
export const PROP_IDS = [
  'stone-workshop',
  'second-hut',
  // The finished stone furnace (the Rule Engine's furnace-built result).
  'furnace',
  'practical-cave',
  'fence',
  'feed-area',
  'empty-bucket',
  'livestock-parent',
  'livestock-child',
  'dry-riverbed',
  'spring-pond',
  'flowing-riverbed',
  'filled-bucket',
  'village-homes',
  'shrine',
  'guardians',
] as const;
export type PropId = (typeof PROP_IDS)[number];

export interface WorldState {
  readonly turn: number;
  readonly selectedElements: readonly Element[];
  // 0: no fire. 1: the campfire. 2: it has levelled up into a cooking fire (Turn 2).
  readonly fireStage: number;
  // The plant stage Presentation has revealed so far, 0 to 5 (0: nothing planted, 1 sprouts,
  // 2 saplings, 3 red fruit, 4 blossoms, 5 golden fruit). It mirrors the Rule Engine's
  // plant Stage but is raised one Wave at a time, each Wave presenting the plant Event that
  // raised it; it is never read back by any rule.
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
  // Props revealed so far, in reveal order, without duplicates.
  readonly props: readonly PropId[];
}

export const FIRST_RESIDENT_ID = 'resident-1';
export const SECOND_RESIDENT_ID = 'resident-2';
export const THIRD_RESIDENT_ID = 'resident-3';
// The residents that join the village in Turn 4, in id order.
export const VILLAGE_RESIDENT_IDS = ['resident-4', 'resident-5', 'resident-6'] as const;

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
    props: [],
  };
}

export const revealProp = (world: WorldState, id: PropId): WorldState =>
  world.props.includes(id) ? world : { ...world, props: [...world.props, id] };

export const hasProp = (world: WorldState, id: PropId): boolean => world.props.includes(id);

// Reveals the plant at `stage` (never lowers it): the visible mirror of one plant Event.
export const revealPlantStage = (world: WorldState, stage: number): WorldState =>
  world.plantStage >= stage ? world : { ...world, plantStage: stage };

// Adds residents that are not yet present, all standing at `place`. Re-applying it
// changes nothing, so a repeated reveal can never add a resident twice.
export function addResidents(world: WorldState, ids: readonly string[], place: ResidentPlace): WorldState {
  const fresh = ids.filter((id) => !world.residents.some((resident) => resident.id === id));
  if (fresh.length === 0) return world;
  const residents: readonly Resident[] = [
    ...world.residents,
    ...fresh.map((id): Resident => ({ id, place, target: null, motion: 'idle' })),
  ];
  return { ...world, population: residents.length, residents };
}

export const moveResident = (world: WorldState, id: string, place: ResidentPlace): WorldState =>
  updateResident(world, id, { place, target: null, motion: 'idle' });

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
