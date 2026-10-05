// Authoritative game state. Pure data: no Phaser, no timing, no rendering.
export const ELEMENTS = ['fire', 'plant', 'rock', 'water'] as const;
export type Element = (typeof ELEMENTS)[number];

export interface WorldState {
  readonly turn: number;
  readonly selectedElements: readonly Element[];
  readonly fireStage: number;
  readonly humanStage: number;
  readonly population: number;
  readonly isCold: boolean;
}

export function createInitialWorldState(): WorldState {
  return {
    turn: 0,
    selectedElements: [],
    fireStage: 0,
    humanStage: 1,
    population: 1,
    isCold: true,
  };
}
