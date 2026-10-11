// Authoritative game state. Pure data: no Phaser, no timing, no rendering.
export const ELEMENTS = ['fire', 'plant', 'rock', 'water'] as const;
export type Element = (typeof ELEMENTS)[number];

export interface WorldState {
  readonly turn: number;
  readonly selectedElements: readonly Element[];
  readonly fireStage: number;
  // 0: no plot. 1: the sprout plot exists (Turn 2).
  readonly plantStage: number;
  // 1: the rain shelter the island starts with. 2: it has levelled up into a hut.
  readonly shelterStage: number;
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
    humanStage: 1,
    population: 1,
    isCold: true,
  };
}

// Semantic questions about the world. Rules and Presentation ask these instead
// of comparing stage numbers, so a stage's meaning lives in one place.
export const hasSproutPlot = (world: WorldState): boolean => world.plantStage >= 1;
export const hasUpgradedHut = (world: WorldState): boolean => world.shelterStage >= 2;
