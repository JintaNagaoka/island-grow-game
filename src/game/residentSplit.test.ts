import { describe, expect, it } from 'vitest';
import { SliceGame } from './sliceGame';
import { SPLIT_WAVE_MS, WAVE_DURATIONS_MS } from './timing';
import { PLANT_LIFE_WAVES } from './waves';
import { createInitialWorldState, splitResident } from './worldState';

const TURN1_MS = Object.values(WAVE_DURATIONS_MS).reduce((sum, ms) => sum + ms, 0);
const TURN2_MS = PLANT_LIFE_WAVES.reduce((sum, wave) => sum + wave.durationMs, 0);
const WALK_MS = PLANT_LIFE_WAVES.find((wave) => wave.id === 'human-walks-to-plot')?.durationMs ?? NaN;

const RESIDENT_1_AT_FIRE = { id: 'resident-1', place: 'fire', target: null, motion: 'idle' };
const RESIDENT_2_AT_FIRE = { id: 'resident-2', place: 'fire', target: null, motion: 'idle' };
const RESIDENT_2_WALKING = { id: 'resident-2', place: 'fire', target: 'plot', motion: 'walking' };

function afterTurn1(speed = 1): SliceGame {
  const game = new SliceGame({ playbackSpeed: speed });
  game.selectElement('fire');
  game.advance(TURN1_MS / speed);
  return game;
}

describe('Turn 1 keeps one resident', () => {
  it('starts with exactly one resident and keeps one through Turn 1', () => {
    const game = new SliceGame();
    expect(game.snapshot().world.population).toBe(1);
    expect(game.snapshot().world.residents.map((r) => r.id)).toEqual(['resident-1']);
    game.selectElement('fire');
    for (let t = 0; t < TURN1_MS; t += 100) {
      game.advance(100);
      expect(game.snapshot().world.population).toBe(1);
      expect(game.snapshot().world.residents).toHaveLength(1);
    }
    expect(game.snapshot().world.residents).toEqual([RESIDENT_1_AT_FIRE]);
    expect(game.snapshot().world.humanStage).toBe(1);
  });
});

describe('Turn 2 split Wave', () => {
  it('opens Turn 2 with a split Wave of the centralized provisional duration', () => {
    expect(SPLIT_WAVE_MS).toBe(600);
    expect(PLANT_LIFE_WAVES[0]).toMatchObject({ id: 'human-splits', durationMs: SPLIT_WAVE_MS });
    expect(PLANT_LIFE_WAVES[1].id).toBe('human-walks-to-plot');
  });

  it('makes the population exactly 2 the moment plant is accepted, both residents idle at the fire', () => {
    const game = afterTurn1();
    expect(game.snapshot().world.population).toBe(1);
    expect(game.selectElement('plant')).toEqual({ accepted: true });
    const { world, activeWave } = game.snapshot();
    expect(activeWave).toMatchObject({ id: 'human-splits', progress: 0 });
    expect(world.population).toBe(2);
    expect(world.humanStage).toBe(2);
    expect(world.residents).toEqual([RESIDENT_1_AT_FIRE, RESIDENT_2_AT_FIRE]);
  });

  it('keeps resident 2 idle with no target until the split Wave completes, then starts the walk', () => {
    const game = afterTurn1();
    game.selectElement('plant');
    for (const ms of [0, 1, SPLIT_WAVE_MS / 2, SPLIT_WAVE_MS - 2]) {
      game.advance(ms === 0 ? 0 : ms - (game.snapshot().activeWave?.elapsedMs ?? 0));
      const { world, activeWave } = game.snapshot();
      expect(activeWave?.id).toBe('human-splits');
      expect(world.residents).toEqual([RESIDENT_1_AT_FIRE, RESIDENT_2_AT_FIRE]);
    }
    game.advance(2);
    const { world, activeWave } = game.snapshot();
    expect(activeWave).toMatchObject({ id: 'human-walks-to-plot', elapsedMs: 0 });
    expect(world.residents).toEqual([RESIDENT_1_AT_FIRE, RESIDENT_2_WALKING]);
  });

  it('gives each resident a distinct stable id for the rest of the game', () => {
    const game = afterTurn1();
    game.selectElement('plant');
    const ids = () => game.snapshot().world.residents.map((r) => r.id);
    const initial = ids();
    expect(new Set(initial).size).toBe(2);
    for (let t = 0; t < TURN2_MS + 500; t += 50) {
      game.advance(50);
      expect(ids()).toEqual(initial);
    }
  });

  it('does not split on rejected selections or without plant', () => {
    const game = new SliceGame();
    expect(game.selectElement('plant')).toMatchObject({ accepted: false });
    expect(game.snapshot().world.population).toBe(1);
    game.selectElement('fire');
    game.selectElement('plant');
    expect(game.snapshot().world.population).toBe(1);
  });

  it('cannot add residents by re-selecting plant, repeated snapshots or extra time', () => {
    const game = afterTurn1();
    game.selectElement('plant');
    for (let i = 0; i < 20; i += 1) {
      expect(game.selectElement('plant')).toEqual({ accepted: false, reason: 'input-locked' });
      game.snapshot();
    }
    game.advance(TURN2_MS);
    expect(game.selectElement('plant')).toEqual({ accepted: false, reason: 'already-selected' });
    for (let i = 0; i < 20; i += 1) game.snapshot();
    game.advance(100_000);
    expect(game.snapshot().world.population).toBe(2);
    expect(game.snapshot().world.residents).toHaveLength(2);
  });

  it('splitResident is idempotent and does not mutate its input', () => {
    const base = { ...createInitialWorldState() };
    const once = splitResident(base);
    expect(base.population).toBe(1);
    expect(splitResident(once)).toBe(once);
    expect(splitResident(splitResident(once))).toEqual(once);
  });
});

describe('residents stay independent', () => {
  it('keeps resident 1 waiting at the fire while resident 2 walks, then arrives at the plot', () => {
    const game = afterTurn1();
    game.selectElement('plant');
    const resident = (id: string) => game.snapshot().world.residents.find((r) => r.id === id);
    game.advance(SPLIT_WAVE_MS + WALK_MS - 1);
    expect(game.snapshot().activeWave?.id).toBe('human-walks-to-plot');
    expect(resident('resident-1')).toEqual(RESIDENT_1_AT_FIRE);
    expect(resident('resident-2')).toEqual(RESIDENT_2_WALKING);
    game.advance(1);
    // Resident 2 stopping at the plot leaves resident 1 untouched, and vice versa.
    expect(resident('resident-1')).toEqual(RESIDENT_1_AT_FIRE);
    expect(resident('resident-2')).toEqual({ id: 'resident-2', place: 'plot', target: null, motion: 'idle' });
  });

  it('retains two distinct residents after Turn 2 for a later turn', () => {
    const game = afterTurn1();
    game.selectElement('plant');
    game.advance(TURN2_MS);
    const { world, phase } = game.snapshot();
    expect(phase).toBe('completed');
    expect(world.population).toBe(2);
    expect(world.humanStage).toBe(2);
    expect(world.residents.map((r) => r.id)).toEqual(['resident-1', 'resident-2']);
    expect(world.residents[0]).toEqual(RESIDENT_1_AT_FIRE);
    expect(world.residents[1].place).toBe('plot');
  });
});

describe('split timing is logical-clock driven', () => {
  const finalWorld = (speed: number, step: number) => {
    const game = afterTurn1(speed);
    game.selectElement('plant');
    for (let t = 0; t < TURN2_MS / speed + 1; t += step) game.advance(step);
    return game.snapshot().world;
  };

  it('ends in the same two-resident state at every playback speed and frame split', () => {
    const baseline = finalWorld(1, 16);
    for (const [speed, step] of [[0.25, 16], [0.5, 7], [2, 33], [4, 16.667], [16, 100], [1, 1]] as const) {
      expect(finalWorld(speed, step)).toEqual(baseline);
    }
  });

  it('starts the walk at the same logical moment at any playback speed', () => {
    for (const speed of [0.25, 0.5, 2, 4]) {
      const game = afterTurn1();
      game.selectElement('plant');
      game.setPlaybackSpeed(speed);
      game.advance((SPLIT_WAVE_MS - 1) / speed);
      expect(game.snapshot().world.residents[1]).toEqual(RESIDENT_2_AT_FIRE);
      game.advance(1 / speed + 1e-9);
      expect(game.snapshot().world.residents[1]).toEqual(RESIDENT_2_WALKING);
    }
  });

  it('has the same resident state mid-walk however the time is split', () => {
    const target = SPLIT_WAVE_MS + WALK_MS / 2;
    const jumped = afterTurn1();
    jumped.selectElement('plant');
    jumped.advance(target);
    const stepped = afterTurn1();
    stepped.selectElement('plant');
    for (let t = 0; t < target; t += 5) stepped.advance(Math.min(5, target - t));
    expect(stepped.snapshot().world).toEqual(jumped.snapshot().world);
  });
});
