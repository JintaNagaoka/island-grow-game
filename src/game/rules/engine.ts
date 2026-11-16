import type { Element } from '../worldState';
import { DIRECT_EFFECTS, RULES, type Rule } from './catalog';
import {
  ROUTE_LENGTH,
  STAGE_KEYS,
  STAGE_MAX,
  TRUE_ROUTE,
  assertValidRuleState,
  assertValidTransition,
  createInitialRuleState,
  setFlag,
  setStage,
  type EndAxis,
  type Ending,
  type RuleState,
} from './state';

// The Rule Engine: a pure function from (state, selected element) to the next
// authoritative state plus the ordered Events that explain it. It never reads a
// clock, a Wave, an animation or a Phaser object, so playback speed and
// presentation timing cannot influence a gameplay outcome.

export type EventPhase = 'direct' | 'time' | 'interaction' | 'epilogue' | 'judgement';

// One rule application: stable id, the phase it ran in, and the state either side.
export interface RuleEvent {
  readonly id: string;
  readonly phase: EventPhase;
  readonly before: RuleState;
  readonly after: RuleState;
}

export interface TurnResult {
  readonly state: RuleState;
  readonly events: readonly RuleEvent[];
}

// END axis from the relative order of fire / plant / stone (water never changes it).
const AXES: Readonly<Record<string, EndAxis>> = {
  'fire,plant,rock': 'prosperity',
  'fire,rock,plant': 'stone_village',
  'plant,fire,rock': 'paradise',
  'plant,rock,fire': 'cave_life',
  'rock,fire,plant': 'craftsmen',
  'rock,plant,fire': 'secret_axis',
};

export function classifyAxis(selectedElements: readonly Element[]): EndAxis {
  const relative = selectedElements.filter((element) => element !== 'water').join(',');
  const axis = AXES[relative];
  if (axis === undefined) throw new RangeError(`cannot classify an incomplete route: ${selectedElements.join(',')}`);
  return axis;
}

export const isExactTrueRoute = (selectedElements: readonly Element[]): boolean =>
  selectedElements.length === TRUE_ROUTE.length && TRUE_ROUTE.every((element, index) => selectedElements[index] === element);

// TRUE: exact order, SECRET not established, the animal at Stage 3, every other
// category at its maximum, and the animal not extinct. Judged on the state after
// the Epilogue Growth, and never an input to any rule.
export function satisfiesTrue(state: RuleState): boolean {
  return (
    isExactTrueRoute(state.selectedElements) &&
    !state.flags.ancientDeviceActivated &&
    !state.flags.animalExtinct &&
    state.stages.animal === 3 &&
    STAGE_KEYS.every((key) => key === 'animal' || state.stages[key] === STAGE_MAX[key])
  );
}

// SECRET, then TRUE, then the normal END.
export function judgeEnding(state: RuleState): Ending {
  const axis = classifyAxis(state.selectedElements);
  if (state.flags.ancientDeviceActivated) return { kind: 'secret', axis };
  if (satisfiesTrue(state)) return { kind: 'true', axis };
  return { kind: 'normal', axis };
}

class Recorder {
  readonly events: RuleEvent[] = [];
  constructor(public state: RuleState) {}

  apply(id: string, phase: EventPhase, next: RuleState): void {
    assertValidTransition(this.state, next);
    for (const key of STAGE_KEYS) {
      if (next.stages[key] > this.state.stages[key] + 1) throw new RangeError(`${id}: ${key} rose by more than one`);
    }
    this.events.push({ id, phase, before: this.state, after: next });
    this.state = next;
  }
}

// Time Progression and Interaction rules, re-evaluated in catalog order until a
// whole pass fires nothing. A rule id fires at most once per call, which bounds the chain.
function runToFixedPoint(recorder: Recorder): void {
  const fired = new Set<string>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const phase of ['time', 'interaction'] as const) {
      for (const rule of RULES) {
        if (rule.phase !== phase || fired.has(rule.id) || !rule.when(recorder.state)) continue;
        fired.add(rule.id);
        recorder.apply(rule.id, phase, rule.apply(recorder.state));
        progressed = true;
      }
    }
  }
}

// Epilogue Growth: exactly one more step of Time Progression. Every time rule is
// evaluated against the same state and the applicable ones are applied once, so
// one growth never feeds the next and no Interaction rule is re-run.
function runEpilogueGrowth(recorder: Recorder): void {
  const grown: RuleState = { ...recorder.state, clock: recorder.state.clock + 1 };
  const applicable = RULES.filter((rule: Rule) => rule.phase === 'time' && rule.when(grown));
  recorder.apply('epilogue-growth', 'epilogue', setFlag(grown, 'epilogueComplete'));
  for (const rule of applicable) recorder.apply(rule.id, 'epilogue', rule.apply(recorder.state));
}

export function runTurn(input: RuleState, element: Element): TurnResult {
  assertValidRuleState(input);
  if (input.ending !== null || input.turn >= ROUTE_LENGTH) throw new RangeError('the route is already complete');
  if (input.selectedElements.includes(element)) throw new RangeError(`element already selected: ${element}`);

  const recorder = new Recorder({
    ...input,
    turn: input.turn + 1,
    clock: input.turn + 1,
    selectedElements: [...input.selectedElements, element],
  });

  const direct = DIRECT_EFFECTS[element];
  recorder.apply(direct.id, 'direct', direct.apply(recorder.state));
  runToFixedPoint(recorder);

  if (recorder.state.turn === ROUTE_LENGTH) {
    runEpilogueGrowth(recorder);
    const ending = judgeEnding(recorder.state);
    recorder.apply(`ending-${ending.kind}`, 'judgement', { ...recorder.state, ending });
    // Only after TRUE has been judged does the guardian transformation raise the animal.
    if (ending.kind === 'true') {
      recorder.apply('guardian-transformed', 'judgement', setStage(recorder.state, 'animal', recorder.state.stages.animal + 1));
    }
  }
  return { state: recorder.state, events: recorder.events };
}

// Plays a whole selection order through the engine; the test oracle and the
// presentation consistency checks use it. Not a separate runtime path.
export function playRoute(order: readonly Element[]): { readonly state: RuleState; readonly turns: readonly TurnResult[] } {
  let state = createInitialRuleState();
  const turns: TurnResult[] = [];
  for (const element of order) {
    const result = runTurn(state, element);
    turns.push(result);
    state = result.state;
  }
  return { state, turns };
}
