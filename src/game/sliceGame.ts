import { DEFAULT_PLAYBACK_SPEED, assertValidPlaybackSpeed, toLogicalDeltaMs } from './timing';
import { runTurn } from './rules/engine';
import { TRUE_ROUTE, createInitialRuleState, type Ending, type RuleState } from './rules/state';
import { FIRE_WARMING_WAVES, PLANT_LIFE_WAVES, ROCK_WAVES, WATER_WAVES, type Wave, type WaveId } from './waves';
import { ELEMENTS, createInitialWorldState, splitResident, type Element, type WorldState } from './worldState';

export type SelectRejection =
  | 'input-locked'
  | 'already-selected'
  // The element is not the next step of the playable route: the review build plays
  // 🔥 → 🌱 → 🪨 → 💧 (each element needs the one before it).
  | 'prerequisite-not-met';

export type SelectResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: SelectRejection };

// awaiting-input: initial screen, fire can be chosen.
// playing: a Wave sequence is running and input is locked.
// completed: the sequence finished; the human is ready/idle (activity-ready
//   waiting state). This is runtime flow state, not part of WorldState. It is
//   reached after Turns 1-3 (🔥, 🌱, 🪨).
// ended: Turn 4 and the Epilogue have played; the END is shown and Retry is offered.
export type SlicePhase = 'awaiting-input' | 'playing' | 'completed' | 'ended';

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
  // The VISIBLE world (revealed Wave by Wave). Presentation reads this.
  readonly world: WorldState;
  // The authoritative RuleState, resolved synchronously at selection. It never
  // changes while Waves play, so it is the only source of gameplay outcomes.
  readonly resolved: RuleState;
  // Ids of the Rule Events resolved for the current turn, in order.
  readonly turnEvents: readonly string[];
  // The END, once the Epilogue has played and the END is shown; otherwise null.
  readonly ending: Ending | null;
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
  // Turn 3 (🪨) Waves. Overridable for tests.
  readonly rockWaves?: readonly Wave[];
  // Turn 4 (💧) + Epilogue Waves. Overridable for tests.
  readonly waterWaves?: readonly Wave[];
  readonly playbackSpeed?: number;
}

// Vertical Slice controller (Turn 1 fire, Turn 2 plant, Turn 3 rock, Turn 4 water +
// Epilogue): input guard + sequential Wave playback driven by an explicit logical
// clock. Selecting an element resolves the whole turn synchronously in the Rule
// Engine (`resolved`, the only gameplay authority); the Waves that follow only
// reveal that outcome on the visible `world`. It has no dependency on Phaser;
// rendering reads snapshot() and never feeds back.
export class SliceGame {
  private readonly turnWaves: Record<Element, readonly Wave[]>;
  // The Waves of the Turn being played; replaced on each accepted selection.
  private waves: readonly Wave[];
  private world: WorldState = createInitialWorldState();
  private resolved: RuleState = createInitialRuleState();
  private turnEvents: readonly string[] = [];
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
      rock: options.rockWaves ?? ROCK_WAVES,
      water: options.waterWaves ?? WATER_WAVES,
    };
    this.waves = this.turnWaves.fire;
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

    // The Rule Engine resolves the entire turn (and, on the last turn, the Epilogue
    // and END judgement) right here. Nothing below can change that outcome.
    const turn = runTurn(this.resolved, element);
    this.resolved = turn.state;
    this.turnEvents = turn.events.map((event) => event.id);
    // Turn 3 onward: a Wave plays only if the Rule Engine produced the Event it presents.
    this.waves = this.turnWaves[element].filter(
      (wave) => wave.event === undefined || this.turnEvents.includes(wave.event),
    );
    this.world = { ...this.world, selectedElements: [...this.world.selectedElements, element] };
    // Turn 2 begins with the population split, applied here (not by a Wave or an
    // animation) so it is authoritative from the accepted selection onward.
    if (element === 'plant') this.world = splitResident(this.world);
    this.waveIndex = 0;
    this.waveElapsedMs = 0;
    if (this.waves.length === 0) {
      this.finishTurn();
    } else {
      this.phase = 'playing';
    }
    return { accepted: true };
  }

  // Starts over from the initial game: authoritative state, visible world, input
  // history, Wave progress and the logical clock. Only offered at the END.
  retry(): boolean {
    if (this.phase !== 'ended') return false;
    this.world = createInitialWorldState();
    this.resolved = createInitialRuleState();
    this.turnEvents = [];
    this.waves = this.turnWaves.fire;
    this.phase = 'awaiting-input';
    this.waveIndex = 0;
    this.waveElapsedMs = 0;
    this.completedWaves = [];
    this.clockMs = 0;
    return true;
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
      resolved: this.resolved,
      turnEvents: this.turnEvents,
      ending: this.phase === 'ended' ? this.resolved.ending : null,
      phase: this.phase,
      inputLocked: this.phase === 'playing',
      selectableElements: ELEMENTS.filter((element) => this.rejectionFor(element) === null),
      activeWave: this.phase === 'playing' ? this.describeActiveWave() : null,
      completedWaves: [...this.completedWaves],
      clockMs: this.clockMs,
    };
  }

  // Why `element` cannot be selected now, or null when it can. The review build
  // plays the one route 🔥 → 🌱 → 🪨 → 💧: Turn 1 (🔥) is always first and each later
  // element opens only once the one before it has completed. Each element can be
  // chosen once. (The Rule Engine itself accepts every order; see rules/engine.ts.)
  private rejectionFor(element: Element): SelectRejection | null {
    if (this.phase === 'playing') return 'input-locked';
    if (this.world.selectedElements.includes(element)) return 'already-selected';
    if (this.phase === 'ended') return 'input-locked';
    if (TRUE_ROUTE[this.resolved.turn] !== element) return 'prerequisite-not-met';
    return null;
  }

  private completeActiveWave(wave: Wave): void {
    this.world = wave.complete(this.world);
    this.completedWaves.push(wave.id);
    this.waveIndex += 1;
    this.waveElapsedMs = 0;
    if (this.waveIndex >= this.waves.length) this.finishTurn();
  }

  // The turn's Waves are done: wait for the next selection, or show the END.
  private finishTurn(): void {
    this.phase = this.resolved.ending !== null ? 'ended' : 'completed';
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
