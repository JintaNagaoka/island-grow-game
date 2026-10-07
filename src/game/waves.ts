import { WAVE_DURATIONS_MS } from './timing';
import type { WorldState } from './worldState';

export type WaveId = 'fire-appears' | 'human-notices-and-approaches' | 'human-warms-up';

// A Wave is one timed step of an Event. Its WorldState effect is applied by
// game logic when the Wave's logical duration elapses, never by an animation
// callback.
export interface Wave {
  readonly id: WaveId;
  readonly durationMs: number;
  readonly complete: (world: WorldState) => WorldState;
}

// Vertical Slice 01: the fire event. Order here is the playback order.
export const FIRE_WARMING_WAVES: readonly Wave[] = [
  {
    id: 'fire-appears',
    durationMs: WAVE_DURATIONS_MS.fireAppears,
    complete: (world) => ({ ...world, fireStage: 1 }),
  },
  {
    // The human notices the fire and walks to it. No persistent state changes.
    id: 'human-notices-and-approaches',
    durationMs: WAVE_DURATIONS_MS.humanNoticesAndApproaches,
    complete: (world) => world,
  },
  {
    id: 'human-warms-up',
    durationMs: WAVE_DURATIONS_MS.humanWarmsUp,
    complete: (world) => ({ ...world, isCold: false }),
  },
];
