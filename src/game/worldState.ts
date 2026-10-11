// Authoritative game state. Pure data: no Phaser, no timing, no rendering.
export const ELEMENTS = ['fire', 'plant', 'rock', 'water'] as const;
export type Element = (typeof ELEMENTS)[number];

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
  readonly population: number;
  readonly isCold: boolean;
}

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
    isCold: true,
  };
}

// Semantic questions about the world. Rules and Presentation ask these instead
// of comparing stage numbers, so a stage's meaning lives in one place.
export const hasSproutPlot = (world: WorldState): boolean => world.plantStage >= 1;
export const hasUpgradedHut = (world: WorldState): boolean => world.shelterStage >= 2;
export const hasCookingFire = (world: WorldState): boolean => world.fireStage >= 2;
export const hasCaredForAnimal = (world: WorldState): boolean => world.animalStage >= 2;
