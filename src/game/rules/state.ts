import type { Element } from '../worldState';

// Authoritative gameplay state for the Rule Engine. Pure data: no Phaser, no
// timing, no rendering. Stage, Flag and Event are separate concepts:
//   - Stage: the bounded, never-decreasing level of one of the eight categories.
//   - Flag: a durable boolean fact that only ever moves away from its initial value.
//   - Event: a record of one rule application (see engine.ts); never stored here.

// Category order is fixed by the specification: Fire / Plant / Stone / Water /
// Human / Shelter / Animal / Cave.
export const STAGE_KEYS = ['fire', 'plant', 'stone', 'water', 'human', 'shelter', 'animal', 'cave'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export type Stages = Readonly<Record<StageKey, number>>;

export const INITIAL_STAGES: Stages = {
  fire: 0,
  plant: 0,
  stone: 0,
  water: 0,
  human: 1,
  shelter: 1,
  animal: 1,
  cave: 1,
};

export const STAGE_MAX: Stages = {
  fire: 5,
  plant: 5,
  stone: 4,
  water: 3,
  human: 4,
  shelter: 4,
  animal: 4,
  cave: 4,
};

// The four elements the player selects, and the Stage each introduces (Direct Effect).
export const ROUTE_LENGTH = 4;
export const ELEMENT_STAGE: Readonly<Record<Element, StageKey>> = {
  fire: 'fire',
  plant: 'plant',
  rock: 'stone',
  water: 'water',
};

// The only order that can satisfy TRUE: 🔥 → 🌱 → 🪨 → 💧.
export const TRUE_ROUTE: readonly Element[] = ['fire', 'plant', 'rock', 'water'];

// Flag name -> value at the start of the game. A flag may move away from this
// value once and never return (isCold starts true and only ever becomes false).
export const INITIAL_FLAGS = {
  isCold: true,
  foodAvailable: false,
  continuousCare: false,
  fenced: false,
  habitatProtected: false,
  // The riverbed has been dug. It is dry until water is selected.
  channelDug: false,
  waterFlowing: false,
  bucketFilled: false,
  // Inert: the animal-extinction thresholds are marked unconfirmed in the Notion
  // specification, so NO rule sets this Flag (see the note in catalog.ts). It is only
  // read by guards that a confirmed extinction rule will later feed.
  animalExtinct: false,
  // The wall of the ancient ruins has been broken by an into-ruins root.
  ruinsExposed: false,
  ancientDeviceActivated: false,
  epilogueComplete: false,
} as const;
export type FlagKey = keyof typeof INITIAL_FLAGS;
export type Flags = { readonly [K in FlagKey]: boolean };
export const FLAG_KEYS = Object.keys(INITIAL_FLAGS) as readonly FlagKey[];

// The narrow side crack beside the cave. The boulder covers it (the cave entrance
// itself is open from the start), exploration can expose it, and a workshop built in
// front of an exposed crack blocks it. Never regresses along this order.
export const CRACK_STATES = ['covered', 'exposed', 'blockedByWorkshop'] as const;
export type CrackState = (typeof CRACK_STATES)[number];

// Where the plant's root goes. Decided exactly once, when the plant is selected, from
// the crack state already established; irreversible afterwards.
export const ROOT_DIRECTIONS = ['undecided', 'lateral', 'intoRuins'] as const;
export type RootDirection = (typeof ROOT_DIRECTIONS)[number];

// Display ENDs. SECRET is judged first, then TRUE, then the normal END.
export type EndKind = 'secret' | 'true' | 'normal';
// The six END axes, classified from the relative order of fire / plant / stone.
export type EndAxis = 'prosperity' | 'stone_village' | 'paradise' | 'cave_life' | 'craftsmen' | 'secret_axis';
export interface Ending {
  readonly kind: EndKind;
  readonly axis: EndAxis;
}

export interface RuleState {
  readonly turn: number;
  // Logical turns of growth that have elapsed. Equals `turn` until the Epilogue
  // Growth pass advances it by one.
  readonly clock: number;
  readonly selectedElements: readonly Element[];
  readonly stages: Stages;
  readonly flags: Flags;
  // The SECRET causal chain is carried by these two multi-valued facts plus the
  // ruinsExposed / ancientDeviceActivated Flags; none of it is derived from order.
  readonly crackState: CrackState;
  readonly rootDirection: RootDirection;
  readonly population: number;
  // Dwellings standing on the island.
  readonly homes: number;
  // Set once, by the END judgement after the Epilogue.
  readonly ending: Ending | null;
}

export function createInitialRuleState(): RuleState {
  return {
    turn: 0,
    clock: 0,
    selectedElements: [],
    stages: { ...INITIAL_STAGES },
    flags: { ...INITIAL_FLAGS },
    crackState: 'covered',
    rootDirection: 'undecided',
    population: 1,
    homes: 1,
    ending: null,
  };
}

export const setStage = (state: RuleState, key: StageKey, value: number): RuleState => ({
  ...state,
  stages: { ...state.stages, [key]: value },
});
export const raiseStage = (state: RuleState, key: StageKey): RuleState => setStage(state, key, state.stages[key] + 1);
export const setFlag = (state: RuleState, key: FlagKey): RuleState => ({
  ...state,
  flags: { ...state.flags, [key]: !INITIAL_FLAGS[key] },
});

export const setCrackState = (state: RuleState, crackState: CrackState): RuleState => ({ ...state, crackState });
export const setRootDirection = (state: RuleState, rootDirection: RootDirection): RuleState => ({ ...state, rootDirection });

export function assertValidRuleState(state: RuleState): void {
  for (const key of STAGE_KEYS) {
    const value = state.stages[key];
    if (!Number.isInteger(value) || value < 0 || value > STAGE_MAX[key]) {
      throw new RangeError(`${key} stage out of bounds: ${value}`);
    }
  }
  if (!Number.isInteger(state.turn) || state.turn < 0 || state.turn > ROUTE_LENGTH) {
    throw new RangeError(`turn out of range: ${state.turn}`);
  }
  if (state.turn !== state.selectedElements.length) {
    throw new RangeError('turn must equal the number of selected elements');
  }
  if (new Set(state.selectedElements).size !== state.selectedElements.length) {
    throw new RangeError('an element can be selected only once');
  }
  if (state.clock < state.turn || state.clock > state.turn + 1) {
    throw new RangeError(`clock out of range: ${state.clock}`);
  }
  // The SECRET chain is causal: each link needs the one before it.
  if (state.rootDirection === 'intoRuins' && state.crackState !== 'exposed') {
    throw new RangeError('an into-ruins root needs an exposed (unblocked) crack');
  }
  if (state.flags.ruinsExposed && state.rootDirection !== 'intoRuins') {
    throw new RangeError('the ruins are exposed only by an into-ruins root');
  }
  if (state.flags.ancientDeviceActivated && !state.flags.ruinsExposed) {
    throw new RangeError('the ancient device needs exposed ruins');
  }
}

// One transition may only move forward: Stages never fall, Flags never return to
// their initial value, history only grows.
export function assertValidTransition(before: RuleState, after: RuleState): void {
  assertValidRuleState(after);
  for (const key of STAGE_KEYS) {
    if (after.stages[key] < before.stages[key]) throw new RangeError(`${key} stage regressed`);
  }
  for (const key of FLAG_KEYS) {
    if (before.flags[key] !== INITIAL_FLAGS[key] && after.flags[key] === INITIAL_FLAGS[key]) {
      throw new RangeError(`${key} flag reverted`);
    }
  }
  if (CRACK_STATES.indexOf(after.crackState) < CRACK_STATES.indexOf(before.crackState)) throw new RangeError('crack state regressed');
  if (after.crackState === 'blockedByWorkshop' && before.crackState === 'covered') throw new RangeError('a covered crack cannot be blocked');
  if (before.rootDirection !== 'undecided' && after.rootDirection !== before.rootDirection) {
    throw new RangeError('root direction is irreversible');
  }
  if (after.population < before.population) throw new RangeError('population regressed');
  if (after.homes < before.homes) throw new RangeError('homes regressed');
  if (before.ending !== null && after.ending !== before.ending) throw new RangeError('ending is final');
  if (after.selectedElements.length < before.selectedElements.length) throw new RangeError('history shrank');
  before.selectedElements.forEach((element, index) => {
    if (after.selectedElements[index] !== element) throw new RangeError('selection history was rewritten');
  });
}

// The stages as the specification's checkpoint string, e.g. "5/5/4/3/4/4/4/4".
export const stageString = (stages: Stages): string => STAGE_KEYS.map((key) => stages[key]).join('/');
