import { describe, expect, it } from 'vitest';
import { ELEMENTS, type Element } from '../worldState';
import { RULES } from './catalog';
import { classifyAxis, isExactTrueRoute, judgeEnding, playRoute, runTurn, satisfiesTrue } from './engine';
import {
  FLAG_KEYS,
  INITIAL_FLAGS,
  STAGE_KEYS,
  STAGE_MAX,
  TRUE_ROUTE,
  assertValidRuleState,
  assertValidTransition,
  createInitialRuleState,
  stageString,
  type CrackState,
  type EndAxis,
  type RootDirection,
  type RuleState,
} from './state';

const F: Element = 'fire';
const P: Element = 'plant';
const S: Element = 'rock';
const W: Element = 'water';

// The 24 permutations as expected-results data and a test oracle only. Axes and
// the SECRET column come from the Issue #19 classification table; the runtime
// derives both from state and relative order, never from this table.
const group = (axis: EndAxis, secret: boolean, orders: readonly (readonly Element[])[]) =>
  orders.map((order) => ({ order, axis, secret }));
const ORACLE: readonly { readonly order: readonly Element[]; readonly axis: EndAxis; readonly secret: boolean }[] = [
  ...group('prosperity', false, [[W, F, P, S], [F, W, P, S], [F, P, W, S], [F, P, S, W]]),
  ...group('stone_village', false, [[W, F, S, P], [F, W, S, P], [F, S, W, P], [F, S, P, W]]),
  ...group('paradise', false, [[W, P, F, S], [P, W, F, S], [P, F, W, S], [P, F, S, W]]),
  ...group('cave_life', false, [[W, P, S, F], [P, W, S, F], [P, S, W, F], [P, S, F, W]]),
  ...group('craftsmen', false, [[W, S, F, P], [S, W, F, P], [S, F, W, P], [S, F, P, W]]),
  ...group('secret_axis', true, [[W, S, P, F], [S, W, P, F], [S, P, W, F], [S, P, F, W]]),
];

// What each END axis family must leave in the SECRET chain, as test-oracle data
// (Notion 14.7 to 14.9). The runtime derives all of it from state, never from this table.
interface ChainExpectation {
  readonly crackState: CrackState;
  readonly rootDirection: RootDirection;
  readonly ruinsExposed: boolean;
  readonly deviceActivated: boolean;
}
const NO_CRACK: ChainExpectation = { crackState: 'covered', rootDirection: 'lateral', ruinsExposed: false, deviceActivated: false };
const CHAIN_BY_AXIS: Readonly<Record<EndAxis, ChainExpectation>> = {
  prosperity: NO_CRACK,
  stone_village: NO_CRACK,
  paradise: NO_CRACK,
  cave_life: NO_CRACK,
  craftsmen: { crackState: 'blockedByWorkshop', rootDirection: 'lateral', ruinsExposed: false, deviceActivated: false },
  secret_axis: { crackState: 'exposed', rootDirection: 'intoRuins', ruinsExposed: true, deviceActivated: true },
};
const SECRET_CHAIN = ['crack-exposed', 'root-direction-committed', 'ruins-exposed', 'ancient-device-activated'] as const;
const eventIds = (order: readonly Element[]): string[] =>
  playRoute(order).turns.flatMap((turn) => turn.events.map((event) => event.id));

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

describe('TRUE route checkpoints', () => {
  const { turns } = playRoute(TRUE_ROUTE);
  const ids = (turn: number): string[] => turns[turn].events.map((event) => event.id);

  it('reaches every authoritative Stage checkpoint', () => {
    expect(stageString(createInitialRuleState().stages)).toBe('0/0/0/0/1/1/1/1');
    expect(stageString(turns[0].state.stages)).toBe('2/0/0/0/1/1/1/1');
    expect(stageString(turns[1].state.stages)).toBe('3/2/0/0/2/2/2/1');
    expect(stageString(turns[2].state.stages)).toBe('5/4/4/0/3/3/3/3');
    const beforeEpilogue = turns[3].events.find((event) => event.id === 'epilogue-growth')!.before;
    expect(stageString(beforeEpilogue.stages)).toBe('5/5/4/3/4/4/3/4');
    expect(stageString(turns[3].state.stages)).toBe('5/5/4/3/4/4/4/4');
  });

  it('tracks population and homes with the route', () => {
    expect(turns.map((turn) => turn.state.population)).toEqual([1, 2, 3, 6]);
    expect(turns.map((turn) => turn.state.homes)).toEqual([1, 1, 2, 4]);
  });

  it('keeps Turn 3 free of freshwater: dug but dry, empty bucket', () => {
    const turn3 = turns[2].state;
    expect(turn3.stages.water).toBe(0);
    expect(turn3.flags).toMatchObject({ channelDug: true, waterFlowing: false, bucketFilled: false, fenced: true, continuousCare: true });
    for (const event of turns[0].events.concat(turns[1].events, turns[2].events)) {
      expect(event.after.flags.waterFlowing).toBe(false);
      expect(event.after.flags.bucketFilled).toBe(false);
    }
  });

  it('breeds only after fruit and the fence exist, and fruit is never harvested at Turn 2', () => {
    expect(ids(1)).not.toContain('plant-fruits');
    const family = turns[2].events.find((event) => event.id === 'animal-family')!;
    expect(family.before.stages.plant).toBeGreaterThanOrEqual(3);
    expect(family.before.flags).toMatchObject({ fenced: true, habitatProtected: true, continuousCare: true });
    expect(ids(2).indexOf('plant-fruits')).toBeLessThan(ids(2).indexOf('animal-family'));
    expect(ids(2).indexOf('fence-built')).toBeLessThan(ids(2).indexOf('animal-family'));
  });

  it('uses the transported bucket only after the water flows, in causal order', () => {
    const order = ids(3);
    expect(order.indexOf('channel-flows')).toBeLessThan(order.indexOf('water-carried'));
    expect(order.indexOf('human-society')).toBeLessThan(order.indexOf('village-built'));
    expect(order.indexOf('village-built')).toBeLessThan(order.indexOf('cave-shrine'));
    expect(turns[3].events.find((event) => event.id === 'water-carried')!.after.flags.bucketFilled).toBe(true);
  });

  it('applies Epilogue Growth once, judges TRUE after it, and transforms the guardian only after TRUE', () => {
    const order = ids(3);
    expect(order.filter((id) => id === 'epilogue-growth')).toHaveLength(1);
    expect(order.slice(-3)).toEqual(['epilogue-growth', 'ending-true', 'guardian-transformed']);
    const judged = turns[3].events.find((event) => event.id === 'ending-true')!;
    expect(judged.before.stages.animal).toBe(3);
    expect(judged.after.stages.animal).toBe(3);
    expect(judged.after.ending).toEqual({ kind: 'true', axis: 'prosperity' });
    const guardian = turns[3].events.at(-1)!;
    expect(guardian.before.stages.animal).toBe(3);
    expect(guardian.after.stages.animal).toBe(4);
  });

  it('runs phases in order inside a turn: direct, then time, then interaction', () => {
    for (const turn of turns) {
      const phases = turn.events.filter((event) => ['direct', 'time', 'interaction'].includes(event.phase)).map((event) => event.phase);
      expect(phases[0]).toBe('direct');
      expect(phases.filter((phase) => phase === 'direct')).toHaveLength(1);
    }
  });
});

describe('engine contract', () => {
  it('does not mutate its input and is deterministic', () => {
    const state = deepFreeze(playRoute([F, P]).state);
    const first = runTurn(state, S);
    const second = runTurn(state, S);
    expect(second).toEqual(first);
    expect(state.turn).toBe(2);
  });

  it('rejects a repeated element, and any selection after the route is complete', () => {
    expect(() => runTurn(playRoute([F]).state, F)).toThrow(RangeError);
    expect(() => runTurn(playRoute(TRUE_ROUTE).state, F)).toThrow(RangeError);
  });

  it('keeps rule ids unique and marks every delegated condition as provisional', () => {
    const ids = RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of RULES) if (rule.provisional !== undefined) expect(rule.provisional.length).toBeGreaterThan(10);
  });

  it('applies Epilogue Growth as one simultaneous step', () => {
    // 🌱 chosen last has just been tended (Stage 2) and has not yet had a later
    // turn to fruit; the Epilogue Growth gives it exactly one growth step.
    const { turns } = playRoute([F, S, W, P]);
    const last = turns[3];
    const growth = last.events.filter((event) => event.phase === 'epilogue');
    expect(growth.map((event) => event.id)).toEqual(['epilogue-growth', 'plant-fruits']);
    expect(growth[1].after.stages.plant - growth[1].before.stages.plant).toBe(1);
    expect(last.state.flags.epilogueComplete).toBe(true);
  });
});

describe('all 24 permutations', () => {
  it('covers each permutation exactly once', () => {
    expect(new Set(ORACLE.map((entry) => entry.order.join(','))).size).toBe(24);
    for (const { order } of ORACLE) expect([...order].sort()).toEqual([...ELEMENTS].sort());
  });

  describe.each(ORACLE.map((entry) => [entry.order.join(' → '), entry] as const))('%s', (_label, entry) => {
    const run = (): ReturnType<typeof playRoute> => playRoute(entry.order);
    const { state, turns } = run();

    it('completes normally and deterministically', () => {
      expect(state.turn).toBe(4);
      expect(state.ending).not.toBeNull();
      expect(state.flags.epilogueComplete).toBe(true);
      expect(run()).toEqual({ state, turns });
      assertValidRuleState(state);
    });

    it('stays inside stage bounds, never regresses, and fires each rule once per turn', () => {
      let previous = createInitialRuleState();
      for (const turn of turns) {
        // A turn starts from the previous turn's final state with its history advanced.
        expect(turn.events[0].before).toEqual({
          ...previous,
          turn: previous.turn + 1,
          clock: previous.turn + 1,
          selectedElements: entry.order.slice(0, previous.turn + 1),
        });
        previous = turn.events[0].before;
        const ruleIds = turn.events.filter((event) => event.phase !== 'epilogue').map((event) => event.id);
        expect(new Set(ruleIds).size).toBe(ruleIds.length);
        for (const event of turn.events) {
          expect(event.before).toEqual(previous);
          for (const key of STAGE_KEYS) {
            expect(event.after.stages[key]).toBeGreaterThanOrEqual(0);
            expect(event.after.stages[key]).toBeLessThanOrEqual(STAGE_MAX[key]);
            expect(event.after.stages[key] - event.before.stages[key]).toBeGreaterThanOrEqual(0);
            expect(event.after.stages[key] - event.before.stages[key]).toBeLessThanOrEqual(1);
          }
          for (const key of FLAG_KEYS) {
            if (event.before.flags[key] !== INITIAL_FLAGS[key]) expect(event.after.flags[key]).toBe(event.before.flags[key]);
          }
          previous = event.after;
        }
      }
    });

    it('applies Epilogue Growth exactly once and only on the last turn', () => {
      const growths = turns.flatMap((turn) => turn.events).filter((event) => event.id === 'epilogue-growth');
      expect(growths).toHaveLength(1);
      expect(turns.slice(0, 3).flatMap((turn) => turn.events).some((event) => event.phase === 'epilogue')).toBe(false);
    });

    it('classifies the END axis from the relative order and SECRET from causal flags', () => {
      expect(classifyAxis(entry.order)).toBe(entry.axis);
      expect(state.ending?.axis).toBe(entry.axis);
      expect(state.flags.ancientDeviceActivated).toBe(entry.secret);
      expect(state.ending?.kind === 'secret').toBe(entry.secret);
    });

    it('leaves exactly the SECRET-chain facts its route family implies', () => {
      const expected = CHAIN_BY_AXIS[entry.axis];
      expect(state.crackState).toBe(expected.crackState);
      expect(state.rootDirection).toBe(expected.rootDirection);
      expect(state.flags.ruinsExposed).toBe(expected.ruinsExposed);
      expect(state.flags.ancientDeviceActivated).toBe(expected.deviceActivated);
    });

    it('satisfies TRUE only for the exact 🔥 → 🌱 → 🪨 → 💧 route', () => {
      const exact = entry.order.join(',') === TRUE_ROUTE.join(',');
      expect(isExactTrueRoute(entry.order)).toBe(exact);
      expect(state.ending?.kind === 'true').toBe(exact);
      if (exact) expect(stageString(state.stages)).toBe('5/5/4/3/4/4/4/4');
      else expect(state.stages.animal).toBeLessThanOrEqual(3);
    });
  });

  it('never grants TRUE to any other order even when the stages look maximal', () => {
    for (const entry of ORACLE) {
      const { state } = playRoute(entry.order);
      const maximal: RuleState = {
        ...state,
        stages: { ...STAGE_MAX, animal: 3 },
        flags: { ...state.flags, ancientDeviceActivated: false, animalExtinct: false },
      };
      expect(satisfiesTrue(maximal)).toBe(entry.order.join(',') === TRUE_ROUTE.join(','));
    }
  });

  // Judgement guards only. The Notion specification marks the animal-extinction
  // thresholds as unconfirmed, so no rule sets `animalExtinct` and no extinction
  // transition exists or is tested here: the next test pins that absence, and this one
  // hand-builds an extinct state purely to show the TRUE guard reads the Flag.
  it('SECRET outranks TRUE, and a hand-built extinct or incomplete state is denied TRUE', () => {
    const { state } = playRoute(TRUE_ROUTE);
    const preJudgement: RuleState = { ...state, ending: null, stages: { ...state.stages, animal: 3 } };
    expect(judgeEnding(preJudgement).kind).toBe('true');
    expect(judgeEnding({ ...preJudgement, flags: { ...preJudgement.flags, ancientDeviceActivated: true } }).kind).toBe('secret');
    expect(judgeEnding({ ...preJudgement, flags: { ...preJudgement.flags, animalExtinct: true } }).kind).toBe('normal');
    expect(judgeEnding({ ...preJudgement, stages: { ...preJudgement.stages, animal: 4 } }).kind).toBe('normal');
    expect(judgeEnding({ ...preJudgement, stages: { ...preJudgement.stages, cave: 3 } }).kind).toBe('normal');
  });
});

describe('animal extinction (specification unconfirmed)', () => {
  it('has no rule that sets animalExtinct, so no route can reach it yet', () => {
    // Documents an intentional gap, not a validated behaviour: add a transition test
    // together with the rule once the specification confirms the thresholds.
    for (const { order } of ORACLE) {
      for (const turn of playRoute(order).turns) {
        for (const event of turn.events) expect(event.after.flags.animalExtinct).toBe(false);
      }
    }
  });
});

describe('the SECRET causal chain', () => {
  const crackAt = (order: readonly Element[]): CrackState[] =>
    playRoute(order).turns.map((turn) => turn.state.crackState);

  it('starts with a covered crack and an undecided root, and keeps the cave entrance out of the model', () => {
    const initial = createInitialRuleState();
    expect(initial.crackState).toBe('covered');
    expect(initial.rootDirection).toBe('undecided');
    expect(Object.keys(initial)).not.toContain('boulderAnchored');
    expect(Object.keys(initial.flags)).not.toEqual(expect.arrayContaining(['crackExposed', 'rootIntoRuins']));
  });

  it('does not move the boulder for plant, rock, fire (cave life) or the TRUE prefix fire, plant, rock', () => {
    for (const order of [[P, S, F, W], [P, S, W, F], [W, P, S, F], [P, W, S, F], TRUE_ROUTE]) {
      expect(crackAt(order), order.join(',')).toEqual(['covered', 'covered', 'covered', 'covered']);
      expect(eventIds(order)).not.toContain('crack-exposed');
      expect(playRoute(order).state.rootDirection).toBe('lateral');
    }
    // The TRUE prefix uses the cave for storage, community and the shrine instead.
    const ids = eventIds(TRUE_ROUTE);
    expect(ids).toContain('cave-stored');
    expect(ids).toContain('cave-shrine');
  });

  it('exposes the crack only by cold exploration that has no better cave-life purpose', () => {
    // Rock chosen while cold and before any plant exposes it, wherever water falls.
    for (const order of [[S, P, F, W], [S, W, P, F], [W, S, P, F], [S, F, P, W], [W, S, F, P]]) {
      expect(eventIds(order), order.join(',')).toContain('crack-exposed');
      expect(playRoute(order).turns.find((turn) => turn.events.some((e) => e.id === 'crack-exposed'))!.state.turn).toBe(order.indexOf(S) + 1);
    }
    // Fire first warms the island, so a later rock never explores the crack.
    for (const order of [[F, S, P, W], [F, S, W, P], [F, W, S, P], [W, F, S, P], [F, P, S, W], [P, F, S, W]]) {
      expect(eventIds(order), order.join(',')).not.toContain('crack-exposed');
      expect(playRoute(order).state.crackState).toBe('covered');
    }
  });

  it('runs rock, plant, fire as an ordered chain of causal facts, with or without water between', () => {
    for (const order of [[S, P, F, W], [S, P, W, F], [S, W, P, F], [W, S, P, F]]) {
      const ids = eventIds(order);
      const at = SECRET_CHAIN.map((id) => ids.indexOf(id));
      expect(at.every((index) => index >= 0), order.join(',')).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      const { state } = playRoute(order);
      expect(state).toMatchObject({ crackState: 'exposed', rootDirection: 'intoRuins' });
      expect(state.ending).toEqual({ kind: 'secret', axis: 'secret_axis' });
    }
  });

  it('commits the root direction once, from the crack state already established when the plant is selected', () => {
    const { turns } = playRoute([S, P, F, W]);
    const commit = turns[1].events.find((event) => event.id === 'root-direction-committed')!;
    expect(commit.before.crackState).toBe('exposed');
    expect(commit.before.rootDirection).toBe('undecided');
    expect(commit.after.rootDirection).toBe('intoRuins');
    for (const turn of turns) {
      for (const event of turn.events) expect(event.before.rootDirection === 'undecided' || event.after.rootDirection === event.before.rootDirection).toBe(true);
    }
    expect(turns.flatMap((turn) => turn.events).filter((event) => event.id === 'root-direction-committed')).toHaveLength(1);
  });

  it('needs the into-ruins root to grow before the ruins open, and the ruins before the device', () => {
    const { turns } = playRoute([S, P, F, W]);
    const events = turns.flatMap((turn) => turn.events);
    const ruins = events.find((event) => event.id === 'ruins-exposed')!;
    expect(ruins.before.rootDirection).toBe('intoRuins');
    expect(ruins.before.stages.plant).toBeGreaterThanOrEqual(2);
    expect(ruins.before.flags.ancientDeviceActivated).toBe(false);
    const device = events.find((event) => event.id === 'ancient-device-activated')!;
    expect(device.before.flags.ruinsExposed).toBe(true);
    expect(device.before.stages.fire).toBeGreaterThanOrEqual(1);
    // The fire's own selection never jumps straight to the device: three distinct facts come between.
    const fireTurn = turns[2].events.map((event) => event.id);
    expect(fireTurn.indexOf('ruins-exposed')).toBeGreaterThan(fireTurn.indexOf('fire-introduced'));
    expect(fireTurn.indexOf('ancient-device-activated')).toBeGreaterThan(fireTurn.indexOf('ruins-exposed'));
  });

  it('has a workshop built in front of an exposed crack block it, sending the root sideways', () => {
    for (const order of [[S, F, P, W], [S, F, W, P], [S, W, F, P], [W, S, F, P]]) {
      const { state, turns } = playRoute(order);
      const events = turns.flatMap((turn) => turn.events);
      const ids = events.map((event) => event.id);
      expect(ids, order.join(',')).toEqual(expect.arrayContaining(['crack-exposed', 'workshop-blocks-crack', 'root-direction-committed']));
      expect(ids.indexOf('crack-exposed')).toBeLessThan(ids.indexOf('workshop-blocks-crack'));
      expect(ids.indexOf('workshop-blocks-crack')).toBeLessThan(ids.indexOf('root-direction-committed'));
      const blocked = events.find((event) => event.id === 'workshop-blocks-crack')!;
      expect(blocked.before.crackState).toBe('exposed');
      expect(blocked.before.stages.stone).toBeGreaterThanOrEqual(2);
      expect(events.find((event) => event.id === 'root-direction-committed')!.before.crackState).toBe('blockedByWorkshop');
      expect(state).toMatchObject({ crackState: 'blockedByWorkshop', rootDirection: 'lateral' });
      expect(state.flags).toMatchObject({ ruinsExposed: false, ancientDeviceActivated: false });
      expect(state.ending?.kind).toBe('normal');
    }
  });

  it('does not block a root that already chose the ruins when the workshop forms in the same turn as the fire', () => {
    const { state, turns } = playRoute([S, P, F, W]);
    expect(turns[2].events.map((event) => event.id)).toContain('stone-workbench');
    expect(turns[2].events.map((event) => event.id)).not.toContain('workshop-blocks-crack');
    expect(state.crackState).toBe('exposed');
  });

  it('rejects transitions that undo or skip a link of the chain', () => {
    const exposed = playRoute([S, P]).state;
    const blocked = playRoute([S, F, P]).state;
    const covered = createInitialRuleState();
    expect(() => assertValidTransition(exposed, { ...exposed, crackState: 'covered', rootDirection: 'lateral' })).toThrow(RangeError);
    expect(() => assertValidTransition(blocked, { ...blocked, crackState: 'exposed' })).toThrow(RangeError);
    expect(() => assertValidTransition(exposed, { ...exposed, rootDirection: 'lateral' })).toThrow(RangeError);
    expect(() => assertValidTransition(covered, { ...covered, crackState: 'blockedByWorkshop' })).toThrow(RangeError);
    expect(() => assertValidRuleState({ ...covered, rootDirection: 'intoRuins' })).toThrow(RangeError);
    expect(() => assertValidRuleState({ ...covered, flags: { ...covered.flags, ruinsExposed: true } })).toThrow(RangeError);
    expect(() => assertValidRuleState({ ...covered, flags: { ...covered.flags, ancientDeviceActivated: true } })).toThrow(RangeError);
  });
});
