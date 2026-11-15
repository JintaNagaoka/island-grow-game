import { SliceGame, type SliceSnapshot } from '../game/sliceGame';
import { TRUE_ROUTE } from '../game/rules/state';
import type { WaveId } from '../game/waves';

// Test helpers: drive the TRUE route to an exact point of an exact Wave by advancing
// the logical clock in whole Wave steps, so every reading is deterministic.

function step(game: SliceGame, until: (snapshot: SliceSnapshot) => SliceSnapshot | null): SliceSnapshot {
  for (let guard = 0; guard < 200; guard += 1) {
    const snapshot = game.snapshot();
    const done = until(snapshot);
    if (done !== null) return done;
    if (snapshot.phase === 'awaiting-input' || snapshot.phase === 'completed') {
      const next = TRUE_ROUTE[snapshot.resolved.turn];
      if (!game.selectElement(next).accepted) throw new Error(`cannot select ${next}`);
    } else if (snapshot.activeWave !== null) {
      game.advance(snapshot.activeWave.durationMs - snapshot.activeWave.elapsedMs);
    } else {
      throw new Error(`route ended before the target (${snapshot.phase})`);
    }
  }
  throw new Error('target not reached');
}

// The snapshot `progress` (0..<1) of the way through `waveId`.
export function snapshotAt(waveId: WaveId, progress: number): SliceSnapshot {
  const game = new SliceGame();
  return step(game, (snapshot) => {
    const wave = snapshot.activeWave;
    if (wave?.id !== waveId) return null;
    game.advance(Math.max(0, progress * wave.durationMs - wave.elapsedMs));
    return game.snapshot();
  });
}

// The snapshot `elapsedMs` (logical) into `waveId`, which must be shorter than the Wave.
export function snapshotAtMs(waveId: WaveId, elapsedMs: number): SliceSnapshot {
  const game = new SliceGame();
  return step(game, (snapshot) => {
    const wave = snapshot.activeWave;
    if (wave?.id !== waveId) return null;
    game.advance(Math.max(0, elapsedMs - wave.elapsedMs));
    return game.snapshot();
  });
}

// The snapshot at the instant `waveId` has completed (the next Wave is at progress 0).
export function snapshotAfter(waveId: WaveId): SliceSnapshot {
  const game = new SliceGame();
  return step(game, (snapshot) => (snapshot.completedWaves.includes(waveId) ? snapshot : null));
}

// The snapshot when the whole turn of `element` has finished playing.
export function snapshotAfterTurn(turn: 1 | 2 | 3 | 4): SliceSnapshot {
  const game = new SliceGame();
  return step(game, (snapshot) => (snapshot.resolved.turn === turn && snapshot.activeWave === null && snapshot.phase !== 'awaiting-input' ? snapshot : null));
}
