import { describe, expect, it } from 'vitest';
import { SliceGame } from './sliceGame';
import { WAVE_DURATIONS_MS } from './timing';
import { FIRE_WARMING_WAVES, type Wave } from './waves';
import { createInitialWorldState } from './worldState';

const [WAVE1, WAVE2, WAVE3] = [
  WAVE_DURATIONS_MS.fireAppears,
  WAVE_DURATIONS_MS.humanNoticesAndApproaches,
  WAVE_DURATIONS_MS.humanWarmsUp,
];
const TOTAL = WAVE1 + WAVE2 + WAVE3;

function playToEnd(game: SliceGame): void {
  game.advance(TOTAL);
}

describe('initial state', () => {
  it('starts with the specified WorldState and awaits input', () => {
    const snapshot = new SliceGame().snapshot();
    expect(snapshot.world).toEqual({
      turn: 0,
      selectedElements: [],
      fireStage: 0,
      humanStage: 1,
      population: 1,
      isCold: true,
    });
    expect(snapshot.phase).toBe('awaiting-input');
    expect(snapshot.inputLocked).toBe(false);
    expect(snapshot.activeWave).toBeNull();
    expect(snapshot.completedWaves).toEqual([]);
  });

  it('does not progress on its own before fire is selected', () => {
    const game = new SliceGame();
    game.advance(10_000);
    expect(game.snapshot().world).toEqual(createInitialWorldState());
    expect(game.snapshot().phase).toBe('awaiting-input');
  });
});

describe('fire selection', () => {
  it('accepts fire, marks it selected, locks input and starts Wave 1', () => {
    const game = new SliceGame();
    expect(game.selectElement('fire')).toEqual({ accepted: true });
    const snapshot = game.snapshot();
    expect(snapshot.world.selectedElements).toEqual(['fire']);
    expect(snapshot.phase).toBe('playing');
    expect(snapshot.inputLocked).toBe(true);
    expect(snapshot.activeWave).toEqual({ id: 'fire-appears', index: 0, progress: 0 });
    // Persistent state is not yet established while Wave 1 is playing.
    expect(snapshot.world.fireStage).toBe(0);
    expect(snapshot.world.isCold).toBe(true);
  });

  it('reaches the specified final state after all Waves complete', () => {
    const game = new SliceGame();
    game.selectElement('fire');
    playToEnd(game);
    const snapshot = game.snapshot();
    expect(snapshot.phase).toBe('completed');
    expect(snapshot.inputLocked).toBe(false);
    expect(snapshot.activeWave).toBeNull();
    expect(snapshot.world).toEqual({
      turn: 0,
      selectedElements: ['fire'],
      fireStage: 1,
      humanStage: 1,
      population: 1,
      isCold: false,
    });
  });

  it('does not mutate previously returned snapshots', () => {
    const game = new SliceGame();
    const before = game.snapshot();
    game.selectElement('fire');
    playToEnd(game);
    expect(before.world).toEqual(createInitialWorldState());
    expect(before.completedWaves).toEqual([]);
  });

  it('rejects fire re-selection after completion without changing state', () => {
    const game = new SliceGame();
    game.selectElement('fire');
    playToEnd(game);
    const completed = game.snapshot();
    expect(game.selectElement('fire')).toEqual({ accepted: false, reason: 'already-selected' });
    expect(game.snapshot()).toEqual(completed);
  });
});

describe('input lock during Wave playback', () => {
  it.each(['fire', 'plant', 'rock', 'water'] as const)(
    'rejects %s while a Wave is playing, in every Wave',
    (element) => {
      const game = new SliceGame();
      game.selectElement('fire');
      for (const delta of [0, WAVE1 / 2, WAVE1 / 2, WAVE2 / 2, WAVE2 / 2, WAVE3 / 2]) {
        game.advance(delta);
        const before = game.snapshot();
        expect(before.inputLocked).toBe(true);
        expect(game.selectElement(element)).toEqual({ accepted: false, reason: 'input-locked' });
        expect(game.snapshot()).toEqual(before);
      }
    },
  );

  it('cannot start a second playback by mashing fire', () => {
    const game = new SliceGame();
    game.selectElement('fire');
    game.advance(WAVE1 + 100);
    for (let i = 0; i < 20; i += 1) game.selectElement('fire');
    expect(game.snapshot().world.selectedElements).toEqual(['fire']);
    expect(game.snapshot().activeWave?.id).toBe('human-notices-and-approaches');
    game.advance(TOTAL);
    expect(game.snapshot().completedWaves).toEqual(FIRE_WARMING_WAVES.map((wave) => wave.id));
  });
});

describe('unimplemented elements', () => {
  it.each(['plant', 'rock', 'water'] as const)(
    'rejects %s on the initial screen without starting any progression',
    (element) => {
      const game = new SliceGame();
      const before = game.snapshot();
      expect(game.selectElement(element)).toEqual({ accepted: false, reason: 'not-implemented' });
      expect(game.snapshot()).toEqual(before);
      game.advance(TOTAL);
      expect(game.snapshot().phase).toBe('awaiting-input');
      expect(game.snapshot().world).toEqual(createInitialWorldState());
    },
  );

  it.each(['plant', 'rock', 'water'] as const)('rejects %s after completion', (element) => {
    const game = new SliceGame();
    game.selectElement('fire');
    playToEnd(game);
    const completed = game.snapshot();
    expect(game.selectElement(element)).toEqual({ accepted: false, reason: 'not-implemented' });
    expect(game.snapshot()).toEqual(completed);
  });
});

describe('Wave order and completion gating', () => {
  it('plays Wave 1 -> 2 -> 3 and applies each effect only on its own completion', () => {
    const game = new SliceGame();
    game.selectElement('fire');

    game.advance(WAVE1 - 1);
    expect(game.snapshot().activeWave?.id).toBe('fire-appears');
    expect(game.snapshot().world.fireStage).toBe(0);
    expect(game.snapshot().completedWaves).toEqual([]);

    game.advance(1);
    expect(game.snapshot().activeWave).toMatchObject({ id: 'human-notices-and-approaches', index: 1 });
    expect(game.snapshot().world.fireStage).toBe(1);
    expect(game.snapshot().world.isCold).toBe(true);
    expect(game.snapshot().completedWaves).toEqual(['fire-appears']);

    game.advance(WAVE2 - 1);
    expect(game.snapshot().activeWave?.id).toBe('human-notices-and-approaches');
    expect(game.snapshot().world.isCold).toBe(true);

    game.advance(1);
    expect(game.snapshot().activeWave).toMatchObject({ id: 'human-warms-up', index: 2 });
    expect(game.snapshot().world.isCold).toBe(true);

    game.advance(WAVE3 - 1);
    expect(game.snapshot().phase).toBe('playing');
    expect(game.snapshot().world.isCold).toBe(true);

    game.advance(1);
    expect(game.snapshot().phase).toBe('completed');
    expect(game.snapshot().world.isCold).toBe(false);
    expect(game.snapshot().completedWaves).toEqual([
      'fire-appears',
      'human-notices-and-approaches',
      'human-warms-up',
    ]);
  });

  it('reports monotonic progress within a Wave', () => {
    const game = new SliceGame();
    game.selectElement('fire');
    game.advance(WAVE1 / 4);
    expect(game.snapshot().activeWave?.progress).toBeCloseTo(0.25);
    game.advance(WAVE1 / 4);
    expect(game.snapshot().activeWave?.progress).toBeCloseTo(0.5);
  });

  it('carries leftover time into the next Wave but never skips a Wave', () => {
    const game = new SliceGame();
    game.selectElement('fire');
    game.advance(WAVE1 + WAVE2 / 2);
    const snapshot = game.snapshot();
    expect(snapshot.completedWaves).toEqual(['fire-appears']);
    expect(snapshot.activeWave?.id).toBe('human-notices-and-approaches');
    expect(snapshot.activeWave?.progress).toBeCloseTo(0.5);
  });

  it('applies completion effects in order even when one huge delta spans every Wave', () => {
    const applied: string[] = [];
    const waves: Wave[] = FIRE_WARMING_WAVES.map((wave) => ({
      ...wave,
      complete: (world) => {
        applied.push(wave.id);
        return wave.complete(world);
      },
    }));
    const game = new SliceGame({ waves });
    game.selectElement('fire');
    game.advance(1_000_000);
    expect(applied).toEqual(FIRE_WARMING_WAVES.map((wave) => wave.id));
    expect(game.snapshot().phase).toBe('completed');
  });

  it('does not advance Waves from anything other than advance()', () => {
    const game = new SliceGame();
    game.selectElement('fire');
    game.snapshot();
    game.snapshot();
    expect(game.snapshot().activeWave).toEqual({ id: 'fire-appears', index: 0, progress: 0 });
  });

  it('rejects invalid deltas', () => {
    const game = new SliceGame();
    expect(() => game.advance(-1)).toThrow(RangeError);
    expect(() => game.advance(Number.NaN)).toThrow(RangeError);
  });
});

describe('global playback speed', () => {
  function logicalOutcome(speed: number, realStepMs: number) {
    const game = new SliceGame({ playbackSpeed: speed });
    game.selectElement('fire');
    const waveOrder: string[] = [];
    let guard = 0;
    while (game.snapshot().phase === 'playing') {
      game.advance(realStepMs);
      const id = game.snapshot().activeWave?.id;
      if (id && waveOrder[waveOrder.length - 1] !== id) waveOrder.push(id);
      guard += 1;
      expect(guard).toBeLessThan(100_000);
    }
    return { world: game.snapshot().world, completed: game.snapshot().completedWaves, waveOrder };
  }

  it('keeps final state and Wave order identical across speeds', () => {
    const baseline = logicalOutcome(1, 16);
    for (const speed of [0.25, 0.5, 2, 4, 16]) {
      expect(logicalOutcome(speed, 16)).toEqual(baseline);
    }
  });

  it('scales real time to logical time at the single boundary', () => {
    const slow = new SliceGame({ playbackSpeed: 0.5 });
    const fast = new SliceGame({ playbackSpeed: 2 });
    for (const game of [slow, fast]) game.selectElement('fire');
    slow.advance(WAVE1);
    fast.advance(WAVE1);
    expect(slow.snapshot().activeWave?.progress).toBeCloseTo(0.5);
    expect(fast.snapshot().phase).toBe('playing');
    expect(fast.snapshot().completedWaves).toEqual(['fire-appears']);
    expect(fast.snapshot().clockMs).toBe(WAVE1 * 2);
  });

  it('can change speed mid-playback without changing order or result', () => {
    const game = new SliceGame();
    game.selectElement('fire');
    game.advance(WAVE1 / 2);
    game.setPlaybackSpeed(4);
    game.advance(TOTAL / 4);
    expect(game.snapshot().phase).toBe('completed');
    expect(game.snapshot().completedWaves).toEqual(FIRE_WARMING_WAVES.map((wave) => wave.id));
  });

  it('rejects non-positive or non-finite speeds', () => {
    for (const speed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new SliceGame({ playbackSpeed: speed })).toThrow(RangeError);
      expect(() => new SliceGame().setPlaybackSpeed(speed)).toThrow(RangeError);
    }
  });
});

describe('Wave definitions', () => {
  it('keeps the total playback inside the 5-8 second initial target', () => {
    expect(TOTAL).toBeGreaterThanOrEqual(5000);
    expect(TOTAL).toBeLessThanOrEqual(8000);
  });

  it('declares the Waves in the specified order', () => {
    expect(FIRE_WARMING_WAVES.map((wave) => wave.id)).toEqual([
      'fire-appears',
      'human-notices-and-approaches',
      'human-warms-up',
    ]);
  });

  it('requires at least one Wave', () => {
    expect(() => new SliceGame({ waves: [] })).toThrow(RangeError);
  });
});
