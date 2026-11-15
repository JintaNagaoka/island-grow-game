import { describe, expect, it } from 'vitest';
import { SliceGame, type SliceSnapshot } from './sliceGame';
import { playRoute as playRules, runTurn } from './rules/engine';
import { TRUE_ROUTE, createInitialRuleState, stageString, type RuleState } from './rules/state';
import { MAX_FRAME_DELTA_MS } from './timing';
import { FIRE_WARMING_WAVES, PLANT_LIFE_WAVES, ROCK_WAVES, WATER_WAVES, type Wave } from './waves';
import { PROP_IDS, createInitialWorldState, type Element, type PropId } from './worldState';

const sum = (waves: readonly Wave[]): number => waves.reduce((total, wave) => total + wave.durationMs, 0);
const TURN_MS = [sum(FIRE_WARMING_WAVES), sum(PLANT_LIFE_WAVES), sum(ROCK_WAVES), sum(WATER_WAVES)];

function playTurn(game: SliceGame, element: Element, chunk: number): void {
  expect(game.selectElement(element)).toEqual({ accepted: true });
  const total = TURN_MS[TRUE_ROUTE.indexOf(element)];
  for (let elapsed = 0; elapsed < total + chunk; elapsed += chunk) game.advance(chunk);
}

function playRoute(chunk: number, playbackSpeed = 1): SliceGame {
  const game = new SliceGame({ playbackSpeed });
  // A chunk is real time; logical time is chunk * speed. Stay under the frame cap.
  for (const element of TRUE_ROUTE) {
    expect(game.selectElement(element)).toEqual({ accepted: true });
    const total = TURN_MS[TRUE_ROUTE.indexOf(element)] / playbackSpeed;
    for (let elapsed = 0; elapsed < total + chunk; elapsed += chunk) game.advance(chunk);
  }
  return game;
}

// What the visible world must equal once a turn's Waves have all played, derived
// from the authoritative RuleState alone. The test oracle for Wave reveals.
function expectedProps(state: RuleState): PropId[] {
  const { stages, flags } = state;
  const present: Record<PropId, boolean> = {
    'mature-farm': stages.plant >= 3,
    'stone-workshop': stages.stone >= 2,
    'second-hut': state.homes >= 2,
    'practical-cave': stages.cave >= 3,
    fence: flags.fenced,
    'feed-area': flags.fenced,
    'empty-bucket': flags.fenced,
    'livestock-parent': flags.fenced,
    'livestock-child': stages.animal >= 3,
    'dry-riverbed': flags.channelDug,
    'spring-pond': stages.water >= 1,
    'flowing-riverbed': flags.waterFlowing,
    'filled-bucket': flags.bucketFilled,
    'village-homes': state.homes >= 4,
    shrine: stages.cave >= 4,
    guardians: stages.animal >= 4,
  };
  return PROP_IDS.filter((id) => present[id]);
}

function expectVisibleToMatch(snapshot: SliceSnapshot): void {
  const { world, resolved } = snapshot;
  expect([...world.props].sort()).toEqual(expectedProps(resolved).sort());
  expect(world.selectedElements).toEqual(resolved.selectedElements);
  expect(world.population).toBe(resolved.population);
  expect(world.residents).toHaveLength(resolved.population);
  expect(world.isCold).toBe(resolved.flags.isCold);
  expect(world.fireStage).toBe(resolved.stages.fire >= 3 ? 2 : resolved.stages.fire >= 1 ? 1 : 0);
  expect(world.plantStage).toBe(resolved.stages.plant >= 2 ? 1 : 0);
  expect(world.shelterStage).toBe(resolved.stages.shelter >= 2 ? 2 : 1);
  expect(world.animalStage).toBe(resolved.stages.animal >= 2 ? 2 : 1);
  expect(world.humanStage).toBe(resolved.stages.human >= 2 ? 2 : 1);
}

describe('TRUE route through SliceGame', () => {
  it('resolves each checkpoint synchronously at selection, before any Wave plays', () => {
    const game = new SliceGame();
    // Turn 4 resolves to the state AFTER the guardian transformation (animal 4); the
    // Turn 4 normal result (animal 3) is asserted separately, at the Rule Event boundary.
    const checkpoints = ['2/0/0/0/1/1/1/1', '3/2/0/0/2/2/2/1', '5/4/4/0/3/3/3/3', '5/5/4/3/4/4/4/4'];
    TRUE_ROUTE.forEach((element, index) => {
      game.selectElement(element);
      expect(stageString(game.snapshot().resolved.stages)).toBe(checkpoints[index]);
      game.advance(TURN_MS[index] + 1);
    });
  });

  it('keeps the Turn 4 normal result (animal 3) distinct from the guardian transformation (animal 4) at the Rule Event boundaries', () => {
    const turn4 = runTurn(playRules(TRUE_ROUTE.slice(0, 3)).state, 'water');
    const ids = turn4.events.map((event) => event.id);
    const judged = turn4.events[ids.indexOf('ending-true')];
    const guardian = turn4.events[ids.indexOf('guardian-transformed')];
    expect(ids.indexOf('ending-true')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('ending-true')).toBeLessThan(ids.indexOf('guardian-transformed'));
    expect(ids.at(-1)).toBe('guardian-transformed');
    // Immediately before TRUE is judged: the Turn 4 normal result, animal still Stage 3.
    expect(stageString(judged.before.stages)).toBe('5/5/4/3/4/4/3/4');
    expect(judged.before.ending).toBeNull();
    // Judging TRUE changes no Stage; only the next Event raises the animal, by exactly one.
    expect(stageString(judged.after.stages)).toBe('5/5/4/3/4/4/3/4');
    expect(judged.after.ending).toEqual({ kind: 'true', axis: 'prosperity' });
    expect(stageString(guardian.before.stages)).toBe('5/5/4/3/4/4/3/4');
    expect(stageString(guardian.after.stages)).toBe('5/5/4/3/4/4/4/4');
    // No earlier Event of the turn already holds animal 4, and the turn's final state is the guardian one.
    for (const event of turn4.events.slice(0, ids.indexOf('guardian-transformed'))) expect(event.after.stages.animal).toBe(3);
    expect(turn4.state).toEqual(guardian.after);
    // The Wave catalog keeps both moments: the guardian reveal is a Wave, not a state change.
    expect(WATER_WAVES.at(-1)!.event).toBe('guardian-transformed');
  });

  it('never changes the authoritative state while Waves play or frames are chunked', () => {
    const game = new SliceGame();
    for (const [index, element] of TRUE_ROUTE.entries()) {
      game.selectElement(element);
      const resolved = game.snapshot().resolved;
      for (let elapsed = 0; elapsed < TURN_MS[index] + 200; elapsed += 37) {
        game.advance(37);
        expect(game.snapshot().resolved).toBe(resolved);
      }
    }
  });

  it('reveals every durable change in causal order and matches the resolved state when each turn ends', () => {
    const game = new SliceGame();
    for (const [index, element] of TRUE_ROUTE.entries()) {
      playTurn(game, element, 50);
      const snapshot = game.snapshot();
      expectVisibleToMatch(snapshot);
      expect(snapshot.phase).toBe(index === 3 ? 'ended' : 'completed');
    }
  });

  it('plays Turn 3, Turn 4 and Epilogue Waves for exactly the Events the engine produced, in order', () => {
    let state = createInitialRuleState();
    for (const [element, waves] of [
      ['fire', []],
      ['plant', []],
      ['rock', ROCK_WAVES],
      ['water', WATER_WAVES],
    ] as const) {
      const eventIds = runTurn(state, element).events.map((event) => event.id);
      state = runTurn(state, element).state;
      let last = -1;
      for (const wave of waves) {
        const at = eventIds.indexOf(wave.event!);
        expect(at, `${wave.id} presents ${wave.event}`).toBeGreaterThanOrEqual(0);
        expect(at, `${wave.id} keeps causal order`).toBeGreaterThanOrEqual(last);
        last = at;
      }
    }
  });

  it('shows no freshwater, flow or filled bucket during or after Turn 3, then the filled bucket in Turn 4', () => {
    const game = new SliceGame();
    playTurn(game, 'fire', 50);
    playTurn(game, 'plant', 50);
    game.selectElement('rock');
    for (let elapsed = 0; elapsed < TURN_MS[2] + 100; elapsed += 50) {
      game.advance(50);
      const { world, resolved } = game.snapshot();
      expect(world.props).not.toContain('spring-pond');
      expect(world.props).not.toContain('flowing-riverbed');
      expect(world.props).not.toContain('filled-bucket');
      expect(resolved.stages.water).toBe(0);
    }
    const turn3 = game.snapshot().world;
    expect(turn3.props).toEqual(expect.arrayContaining(['dry-riverbed', 'empty-bucket', 'fence', 'livestock-parent', 'livestock-child']));
    expect(turn3.population).toBe(3);
    playTurn(game, 'water', 50);
    const turn4 = game.snapshot().world;
    expect(turn4.props).toEqual(expect.arrayContaining(['spring-pond', 'flowing-riverbed', 'filled-bucket', 'village-homes', 'shrine', 'guardians']));
    expect(turn4.population).toBe(6);
  });

  it('reveals the guardian transformation only in the last Wave, after TRUE is judged', () => {
    const game = new SliceGame();
    playTurn(game, 'fire', 50);
    playTurn(game, 'plant', 50);
    playTurn(game, 'rock', 50);
    game.selectElement('water');
    const seen: string[] = [];
    for (let elapsed = 0; elapsed < TURN_MS[3] + 100; elapsed += 50) {
      game.advance(50);
      const snapshot = game.snapshot();
      if (snapshot.world.props.includes('guardians')) seen.push(snapshot.activeWave?.id ?? 'done');
      // The resolved guardian transformation exists from selection; the END is not shown until the end.
      expect(snapshot.resolved.stages.animal).toBe(4);
      if (snapshot.phase === 'playing') expect(snapshot.ending).toBeNull();
    }
    expect(seen.every((id) => id === 'done')).toBe(true);
    expect(game.snapshot().ending).toEqual({ kind: 'true', axis: 'prosperity' });
  });

  it('locks input during every Wave of every turn and rejects out-of-order or repeated selections', () => {
    const game = new SliceGame();
    for (const [index, element] of TRUE_ROUTE.entries()) {
      game.selectElement(element);
      const before = game.snapshot();
      for (const other of ['fire', 'plant', 'rock', 'water'] as const) {
        expect(game.selectElement(other)).toEqual({ accepted: false, reason: 'input-locked' });
      }
      expect(game.snapshot()).toEqual(before);
      game.advance(TURN_MS[index] + 1);
      if (index < 3) expect(game.snapshot().selectableElements).toEqual([TRUE_ROUTE[index + 1]]);
    }
    expect(game.snapshot().selectableElements).toEqual([]);
    expect(game.selectElement('fire')).toEqual({ accepted: false, reason: 'already-selected' });
    const fresh = new SliceGame();
    expect(fresh.selectElement('water')).toEqual({ accepted: false, reason: 'prerequisite-not-met' });
    expect(fresh.selectElement('rock')).toEqual({ accepted: false, reason: 'prerequisite-not-met' });
    expect(fresh.snapshot().resolved).toEqual(createInitialRuleState());
  });

  it('is deterministic across frame chunking and playback speed', () => {
    const reference = playRoute(MAX_FRAME_DELTA_MS).snapshot();
    for (const [chunk, speed] of [[16, 1], [33, 1], [100, 1], [25, 2], [25, 4], [10, 0.5]] as const) {
      const snapshot = playRoute(chunk, speed).snapshot();
      expect(snapshot.world).toEqual(reference.world);
      expect(snapshot.resolved).toEqual(reference.resolved);
      expect(snapshot.completedWaves).toEqual(reference.completedWaves);
      expect(snapshot.ending).toEqual(reference.ending);
    }
  });

  it('plays a large delta through every Wave of a turn in one advance', () => {
    const game = new SliceGame();
    game.selectElement('fire');
    game.advance(TURN_MS[0] + TURN_MS[1]);
    game.selectElement('plant');
    game.advance(TURN_MS[1] * 10);
    game.selectElement('rock');
    game.advance(TURN_MS[2] * 10);
    // completedWaves accumulates across turns; this turn's Waves are its tail.
    expect(game.snapshot().completedWaves.slice(-ROCK_WAVES.length)).toEqual(ROCK_WAVES.map((wave) => wave.id));
    expectVisibleToMatch(game.snapshot());
  });
});

describe('END and Retry', () => {
  it('shows the END only after the Epilogue Waves, with input closed and Retry offered', () => {
    const game = playRoute(50);
    const snapshot = game.snapshot();
    expect(snapshot.phase).toBe('ended');
    expect(snapshot.ending).toEqual({ kind: 'true', axis: 'prosperity' });
    expect(snapshot.inputLocked).toBe(false);
    expect(snapshot.selectableElements).toEqual([]);
    expect(snapshot.activeWave).toBeNull();
    expect(stageString(snapshot.resolved.stages)).toBe('5/5/4/3/4/4/4/4');
    expect(game.selectElement('water')).toEqual({ accepted: false, reason: 'already-selected' });
  });

  it('refuses Retry before the END and leaves everything untouched', () => {
    const game = new SliceGame();
    expect(game.retry()).toBe(false);
    game.selectElement('fire');
    game.advance(500);
    const mid = game.snapshot();
    expect(game.retry()).toBe(false);
    expect(game.snapshot()).toEqual(mid);
    game.advance(TURN_MS[0]);
    const completed = game.snapshot();
    expect(game.retry()).toBe(false);
    expect(game.snapshot()).toEqual(completed);
  });

  it('Retry restores gameplay and presentation to exactly the initial state', () => {
    const game = playRoute(50);
    expect(game.retry()).toBe(true);
    expect(game.snapshot()).toEqual(new SliceGame().snapshot());
    expect(game.snapshot().world).toEqual(createInitialWorldState());
    expect(game.snapshot().resolved).toEqual(createInitialRuleState());
    expect(game.snapshot().clockMs).toBe(0);
    expect(game.snapshot().selectableElements).toEqual(['fire']);
    // Nothing keeps playing after Retry.
    game.advance(60_000);
    expect(game.snapshot().world).toEqual(createInitialWorldState());
  });

  it('replays the whole route identically after Retry, more than once', () => {
    const game = new SliceGame();
    const finals: SliceSnapshot[] = [];
    for (let round = 0; round < 3; round += 1) {
      for (const [index, element] of TRUE_ROUTE.entries()) {
        expect(game.selectElement(element)).toEqual({ accepted: true });
        game.advance(TURN_MS[index] + 1);
      }
      finals.push(game.snapshot());
      expect(game.retry()).toBe(true);
    }
    // Compare everything except the logical clock, which Retry deliberately restarts per round.
    const comparable = ({ clockMs: _clock, ...rest }: SliceSnapshot) => rest;
    expect(comparable(finals[1])).toEqual(comparable(finals[0]));
    expect(comparable(finals[2])).toEqual(comparable(finals[0]));
  });

  it('keeps the chosen playback speed across Retry', () => {
    const game = new SliceGame({ playbackSpeed: 4 });
    for (const [index, element] of TRUE_ROUTE.entries()) {
      game.selectElement(element);
      game.advance(TURN_MS[index] / 4 + 1);
    }
    expect(game.retry()).toBe(true);
    game.selectElement('fire');
    game.advance(100);
    expect(game.snapshot().clockMs).toBe(400);
  });
});
