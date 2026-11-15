import type { Element } from '../worldState';
import {
  ELEMENT_STAGE,
  INITIAL_FLAGS,
  STAGE_MAX,
  raiseStage,
  setCrackState,
  setFlag,
  setRootDirection,
  type FlagKey,
  type RuleState,
  type StageKey,
} from './state';

// The common causal rule catalog. Rules describe causes (state conditions), never
// an END -> Stage table and never a permutation. Every route runs the same
// catalog; order-specific outcomes emerge from the state each selection finds.
//
// Phases, in evaluation order inside a turn:
//   direct       the selected element's own effect (DIRECT_EFFECTS), applied once.
//   time         natural growth that needs elapsed turns (also re-run once, as the
//                Epilogue Growth).
//   interaction  one category enabling another.
// `time` then `interaction` rules are re-evaluated until a pass fires nothing (a
// fixed point). Each rule id fires at most once per turn, so the chain is finite.

export type RulePhase = 'time' | 'interaction';

export interface Rule {
  readonly id: string;
  readonly phase: RulePhase;
  readonly when: (state: RuleState) => boolean;
  readonly apply: (state: RuleState) => RuleState;
  // Present when the condition is a delegated detail design rather than a
  // confirmed specification rule; the text names what is uncertain.
  readonly provisional?: string;
}

// Direct Effects: what introducing an element does by itself. Each fires on the
// element's own Turn only.
export const DIRECT_EFFECTS: Readonly<Record<Element, { readonly id: string; readonly apply: (state: RuleState) => RuleState }>> =
  Object.fromEntries(
    (Object.keys(ELEMENT_STAGE) as Element[]).map((element) => [
      element,
      { id: `${ELEMENT_STAGE[element]}-introduced`, apply: (state: RuleState) => raiseStage(state, ELEMENT_STAGE[element]) },
    ]),
  ) as Record<Element, { readonly id: string; readonly apply: (state: RuleState) => RuleState }>;

// Logical turns elapsed since `element` was selected, or -1 when it was not.
const ageOf = (state: RuleState, element: Element): number => {
  const index = state.selectedElements.indexOf(element);
  return index < 0 ? -1 : state.clock - (index + 1);
};

interface StageRuleOptions {
  readonly id: string;
  readonly phase: RulePhase;
  readonly key: StageKey;
  // The Stage this rule leaves; it fires only from exactly this Stage, one step.
  readonly from: number;
  readonly when: (state: RuleState) => boolean;
  readonly also?: (state: RuleState) => RuleState;
  readonly provisional?: string;
}

const stageRule = ({ id, phase, key, from, when, also, provisional }: StageRuleOptions): Rule => ({
  id,
  phase,
  provisional,
  when: (state) => state.stages[key] === from && state.stages[key] < STAGE_MAX[key] && when(state),
  apply: (state) => {
    const raised = raiseStage(state, key);
    return also ? also(raised) : raised;
  },
});

const flagRule = (
  id: string,
  key: FlagKey,
  when: (state: RuleState) => boolean,
  options: { readonly phase?: RulePhase; readonly provisional?: string } = {},
): Rule => ({
  id,
  phase: options.phase ?? 'interaction',
  provisional: options.provisional,
  // Unset means still at its initial value; a flag is set at most once.
  when: (state) => state.flags[key] === INITIAL_FLAGS[key] && when(state),
  apply: (state) => setFlag(state, key),
});

const warm = (state: RuleState): boolean => !state.flags.isCold;

const DELEGATED = 'Delegated detail design; the exact threshold is not specified.';

// Animal extinction: the Notion specification marks the thresholds for animal
// extinction as UNCONFIRMED, so this catalog deliberately has NO rule that sets
// `animalExtinct`. The Flag exists only so the guards below (and TRUE judgement) already
// read it; until a confirmed rule is added, no route can become extinct, and nothing in
// the tests claims to validate an extinction transition.

export const RULES: readonly Rule[] = [
  // --- Time progression: natural growth.
  stageRule({ id: 'plant-tended', phase: 'time', key: 'plant', from: 1, when: warm }),
  stageRule({
    id: 'plant-fruits',
    phase: 'time',
    key: 'plant',
    from: 2,
    // Fruit needs a later turn than planting, so it never appears at Turn 2.
    when: (state) => warm(state) && ageOf(state, 'plant') >= 1,
  }),

  // --- Interaction: warmth, food, people, shelter.
  {
    id: 'human-warms',
    phase: 'interaction',
    when: (state) => state.stages.fire >= 1 && state.flags.isCold,
    apply: (state) => ({ ...state, flags: { ...state.flags, isCold: false } }),
  },
  stageRule({ id: 'fire-tended', phase: 'interaction', key: 'fire', from: 1, when: warm }),
  // Turn 2 feeding uses gathered forage, so the feeding pose does not imply fruit.
  flagRule('forage-gathered', 'foodAvailable', (state) => warm(state) && state.stages.plant >= 2, {
    provisional: DELEGATED,
  }),
  stageRule({
    id: 'human-splits',
    phase: 'interaction',
    key: 'human',
    from: 1,
    when: (state) => state.flags.foodAvailable && warm(state),
    also: (state) => ({ ...state, population: 2 }),
  }),
  stageRule({
    id: 'hut-built',
    phase: 'interaction',
    key: 'shelter',
    from: 1,
    when: (state) => state.population >= 2 && state.stages.plant >= 2,
  }),
  stageRule({
    id: 'cooking-established',
    phase: 'interaction',
    key: 'fire',
    from: 2,
    when: (state) => state.flags.foodAvailable && state.stages.shelter >= 2,
  }),
  stageRule({
    id: 'animal-cared',
    phase: 'interaction',
    key: 'animal',
    from: 1,
    when: (state) => state.flags.foodAvailable && warm(state) && !state.flags.animalExtinct,
    also: (state) => setFlag(state, 'continuousCare'),
  }),

  // --- Interaction: stone work and the settlement.
  stageRule({
    id: 'stone-workbench',
    phase: 'interaction',
    key: 'stone',
    from: 1,
    when: (state) => warm(state) && state.flags.foodAvailable,
  }),
  stageRule({
    id: 'human-division',
    phase: 'interaction',
    key: 'human',
    from: 2,
    when: (state) => state.stages.stone >= 2 && state.stages.plant >= 3,
    also: (state) => ({ ...state, population: 3 }),
  }),
  stageRule({ id: 'stone-building', phase: 'interaction', key: 'stone', from: 2, when: (state) => state.stages.human >= 3 }),
  stageRule({
    id: 'homes-built',
    phase: 'interaction',
    key: 'shelter',
    from: 2,
    when: (state) => state.stages.stone >= 3 && state.population >= 3,
    also: (state) => ({ ...state, homes: 2 }),
  }),
  stageRule({
    id: 'fire-lighting',
    phase: 'interaction',
    key: 'fire',
    from: 3,
    when: (state) => state.stages.shelter >= 3 && state.stages.human >= 3,
  }),
  stageRule({
    id: 'furnace-built',
    phase: 'interaction',
    key: 'fire',
    from: 4,
    when: (state) => state.stages.stone >= 3 && state.stages.human >= 3,
  }),
  stageRule({
    id: 'stone-advanced',
    phase: 'interaction',
    key: 'stone',
    from: 3,
    when: (state) => state.stages.fire >= 5 && state.stages.human >= 3,
  }),
  stageRule({
    id: 'plant-spreads',
    phase: 'interaction',
    key: 'plant',
    from: 3,
    when: (state) => state.stages.animal >= 2 && !state.flags.animalExtinct && state.flags.continuousCare,
  }),

  // --- Interaction: cave, livestock enclosure and breeding.
  stageRule({
    id: 'cave-stored',
    phase: 'interaction',
    key: 'cave',
    from: 1,
    when: (state) => state.stages.shelter >= 3 && state.stages.stone >= 2,
  }),
  stageRule({
    id: 'cave-furnished',
    phase: 'interaction',
    key: 'cave',
    from: 2,
    when: (state) => state.stages.fire >= 4 && state.stages.human >= 3,
  }),
  {
    id: 'fence-built',
    phase: 'interaction',
    provisional: DELEGATED,
    when: (state) => state.stages.stone >= 3 && state.flags.continuousCare && !state.flags.fenced,
    apply: (state) => setFlag(setFlag(state, 'fenced'), 'habitatProtected'),
  },
  stageRule({
    id: 'animal-family',
    phase: 'interaction',
    key: 'animal',
    from: 2,
    provisional: DELEGATED,
    when: (state) =>
      state.stages.plant >= 3 &&
      state.flags.continuousCare &&
      state.flags.fenced &&
      state.flags.habitatProtected &&
      warm(state) &&
      !state.flags.animalExtinct,
  }),

  // --- Interaction: water. The riverbed is dug while it is still dry; it flows
  // only after water is selected, and the bucket is filled from the flow.
  flagRule('channel-dug', 'channelDug', (state) => state.stages.stone >= 3 && state.stages.shelter >= 3, {
    provisional: DELEGATED,
  }),
  stageRule({
    id: 'channel-flows',
    phase: 'interaction',
    key: 'water',
    from: 1,
    when: (state) => state.flags.channelDug && state.stages.stone >= 3,
    also: (state) => setFlag(state, 'waterFlowing'),
  }),
  flagRule(
    'water-carried',
    'bucketFilled',
    (state) => state.flags.waterFlowing && state.flags.continuousCare && warm(state),
    { provisional: DELEGATED },
  ),
  stageRule({
    id: 'human-society',
    phase: 'interaction',
    key: 'human',
    from: 3,
    when: (state) => state.flags.foodAvailable && state.flags.waterFlowing && state.stages.shelter >= 3,
    also: (state) => ({ ...state, population: 6 }),
  }),
  stageRule({
    id: 'village-built',
    phase: 'interaction',
    key: 'shelter',
    from: 3,
    when: (state) => state.population >= 6 && state.stages.stone >= 3,
    also: (state) => ({ ...state, homes: 4 }),
  }),
  stageRule({
    id: 'water-network',
    phase: 'interaction',
    key: 'water',
    from: 2,
    when: (state) => state.flags.waterFlowing && state.stages.shelter >= 4 && state.stages.human >= 4,
  }),
  stageRule({
    id: 'ecosystem-flourishes',
    phase: 'interaction',
    key: 'plant',
    from: 4,
    when: (state) => state.flags.waterFlowing && state.stages.animal >= 3 && !state.flags.animalExtinct,
  }),
  stageRule({
    id: 'cave-shrine',
    phase: 'interaction',
    key: 'cave',
    from: 3,
    when: (state) =>
      state.stages.shelter >= 4 && state.stages.fire >= 4 && state.stages.plant >= 5 && state.stages.stone >= 3,
  }),

  // --- Interaction: the SECRET causal chain. Every link reads state, never the order
  // the elements were chosen in:
  //   exploration exposes the crack -> (workshop may block it) -> the plant's root
  //   direction commits from the crack state -> an into-ruins root that has grown
  //   exposes the ruins -> fire-led exploration activates the ancient device.
  // Catalog order matters inside the plant's selection turn: `stone-workbench` (the
  // workshop that food lets stand) is listed earlier, so it is settled before the root
  // commits and a workshop that forms in that same turn blocks the crack first.
  {
    id: 'crack-exposed',
    phase: 'interaction',
    provisional:
      'Exploration-driven boulder movement: the specification gives no turn or event priority, and "a better cave-life purpose" is represented only as the plant already existing.',
    // Stone is at its first Stage only while the cold lasts (the workbench needs warmth),
    // so this is the cold, not-yet-planted exploration of the cave beside the crack.
    when: (state) =>
      state.crackState === 'covered' && state.stages.stone >= 1 && state.flags.isCold && state.stages.plant === 0,
    apply: (state) => setCrackState(state, 'exposed'),
  },
  {
    id: 'workshop-blocks-crack',
    phase: 'interaction',
    when: (state) => state.crackState === 'exposed' && state.rootDirection === 'undecided' && state.stages.stone >= 2,
    apply: (state) => setCrackState(state, 'blockedByWorkshop'),
  },
  {
    id: 'root-direction-committed',
    phase: 'interaction',
    provisional: 'The exact moment of the commit inside the plant\'s selection turn is not specified.',
    when: (state) => state.stages.plant >= 1 && state.rootDirection === 'undecided',
    apply: (state) => setRootDirection(state, state.crackState === 'exposed' ? 'intoRuins' : 'lateral'),
  },
  flagRule('ruins-exposed', 'ruinsExposed', (state) => state.rootDirection === 'intoRuins' && state.stages.plant >= 2, {
    provisional: 'The "sufficient growth" of an into-ruins root is not specified; one tended Stage is a placeholder.',
  }),
  flagRule(
    'ancient-device-activated',
    'ancientDeviceActivated',
    (state) => state.flags.ruinsExposed && warm(state) && state.stages.fire >= 1,
    { provisional: '"Fire-led exploration" has no specified threshold; a lit fire with the ruins exposed is a placeholder.' },
  ),
];
