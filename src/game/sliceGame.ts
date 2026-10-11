import { DEFAULT_PLAYBACK_SPEED, assertValidPlaybackSpeed, toLogicalDeltaMs } from './timing';
import { FIRE_WARMING_WAVES, PLANT_LIFE_WAVES, type Wave, type WaveId } from './waves';
import { ELEMENTS, createInitialWorldState, type Element, type WorldState } from './worldState';

export type SelectRejection =
  | 'input-locked'
  | 'already-selected'
  // The element's Turn is not reachable yet (🌱 before Turn 1 has completed).
  | 'prerequisite-not-met'
  | 'not-implemented';

export type SelectResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: SelectRejection };

// awaiting-input: initial screen, fire can be chosen.
// playing: a Wave sequence is running and input is locked.
// completed: the sequence finished; the human is ready/idle (activity-ready
//   waiting state). This is runtime flow state, not part of WorldState. It is
//   reached after Turn 1 (🔥) and again after Turn 2 (🌱).
export type SlicePhase = 'awaiting-input' | 'playing' | 'completed';

export interface ActiveWave {
  readonly id: WaveId;
  readonly index: number;
  // 0 (just started) up to but excluding 1, in logical time.
  readonly progress: number;
  // Logical (playback-speed-scaled) time into this Wave and its full length.
  // Presentation uses these instead of assuming a Wave's configured duration.
  readonly elapsedMs: number;
  readonly durationMs: number;
}

export interface SliceSnapshot {
  readonly world: WorldState;
  readonly phase: SlicePhase;
  readonly inputLocked: boolean;
  // Elements selectElement() would accept right now: the one source of truth for
  // which buttons are available. Empty while a Wave sequence is playing.
  readonly selectableElements: readonly Element[];
  readonly activeWave: ActiveWave | null;
  readonly completedWaves: readonly WaveId[];
  // Logical clock (already scaled by playback speed) for looping idle animation.
  readonly clockMs: number;
}

export interface SliceGameOptions {
  // Turn 1 (🔥) Waves. Overridable for tests.
  readonly waves?: readonly Wave[];
  // Turn 2 (🌱) Waves. Overridable for tests.
  readonly plantWaves?: readonly Wave[];
  readonly playbackSpeed?: number;
}

// Vertical Slice controller (Turn 1 fire, Turn 2 plant): input guard + sequential Wave playback driven
// by an explicit logical clock. It owns the authoritative WorldState and has
// no dependency on Phaser; rendering reads snapshot() and never feeds back.
export class SliceGame {
  private readonly turnWaves: Partial<Record<Element, readonly Wave[]>>;
  // The Waves of the Turn being played; replaced on each accepted selection.
  private waves: readonly Wave[];
  private world: WorldState = createInitialWorldState();
  private playbackSpeed: number;
  private phase: SlicePhase = 'awaiting-input';
  private waveIndex = 0;
  private waveElapsedMs = 0;
  private completedWaves: WaveId[] = [];
  private clockMs = 0;

  constructor(options: SliceGameOptions = {}) {
    this.turnWaves = {
      fire: options.waves ?? FIRE_WARMING_WAVES,
      plant: options.plantWaves ?? PLANT_LIFE_WAVES,
    };
    this.waves = this.turnWaves.fire ?? FIRE_WARMING_WAVES;
    this.playbackSpeed = options.playbackSpeed ?? DEFAULT_PLAYBACK_SPEED;
    assertValidPlaybackSpeed(this.playbackSpeed);
    for (const waves of Object.values(this.turnWaves)) {
      if (waves.length === 0) {
        throw new RangeError('at least one Wave is required');
      }
    }
  }

  selectElement(element: Element): SelectResult {
    const reason = this.rejectionFor(element);
    if (reason !== null) return { accepted: false, reason };

    this.waves = this.turnWaves[element] ?? this.waves;
    this.world = { ...this.world, selectedElements: [...this.world.selectedElements, element] };
    this.phase = 'playing';
    this.waveIndex = 0;
    this.waveElapsedMs = 0;
    return { accepted: true };
  }

  setPlaybackSpeed(speed: number): void {
    assertValidPlaybackSpeed(speed);
    this.playbackSpeed = speed;
  }

  // Advances logical time by realDeltaMs * playbackSpeed. A Wave completes only
  // when its logical duration has elapsed, and the next Wave starts only after
  // that; leftover time carries into the next Wave.
  advance(realDeltaMs: number): void {
    let remaining = toLogicalDeltaMs(realDeltaMs, this.playbackSpeed);
    this.clockMs += remaining;

    while (this.phase === 'playing' && remaining > 0) {
      const wave = this.waves[this.waveIndex];
      const left = wave.durationMs - this.waveElapsedMs;
      if (remaining < left) {
        this.waveElapsedMs += remaining;
        remaining = 0;
      } else {
        remaining -= left;
        this.completeActiveWave(wave);
      }
    }
  }

  snapshot(): SliceSnapshot {
    return {
      world: this.world,
      phase: this.phase,
      inputLocked: this.phase === 'playing',
      selectableElements: ELEMENTS.filter((element) => this.rejectionFor(element) === null),
      activeWave: this.phase === 'playing' ? this.describeActiveWave() : null,
      completedWaves: [...this.completedWaves],
      clockMs: this.clockMs,
    };
  }

  // Why `element` cannot be selected now, or null when it can. Turn 1 (🔥) is
  // always first; Turn 2 (🌱) opens only once Turn 1 has completed, and each
  // element can be chosen once.
  private rejectionFor(element: Element): SelectRejection | null {
    if (this.phase === 'playing') return 'input-locked';
    if (this.world.selectedElements.includes(element)) return 'already-selected';
    if (this.turnWaves[element] === undefined) return 'not-implemented';
    if (element === 'plant' && !this.world.selectedElements.includes('fire')) {
      return 'prerequisite-not-met';
    }
    return null;
  }

  private completeActiveWave(wave: Wave): void {
    this.world = wave.complete(this.world);
    this.completedWaves.push(wave.id);
    this.waveIndex += 1;
    this.waveElapsedMs = 0;
    if (this.waveIndex >= this.waves.length) {
      this.phase = 'completed';
    }
  }

  private describeActiveWave(): ActiveWave {
    const wave = this.waves[this.waveIndex];
    return {
      id: wave.id,
      index: this.waveIndex,
      progress: wave.durationMs > 0 ? this.waveElapsedMs / wave.durationMs : 0,
      elapsedMs: this.waveElapsedMs,
      durationMs: wave.durationMs,
    };
  }
}
