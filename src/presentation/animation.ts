import type { SliceSnapshot } from '../game/sliceGame';
import { LAYOUT } from './layout';

// Pure functions from the authoritative snapshot to visual parameters.
// They read Wave progress and the logical clock only (no timers, no Phaser), so
// animation speed follows the global playback speed and animation can never
// become the source of truth for game outcomes.

export interface HumanPose {
  readonly x: number;
  // Ground position; `lift` raises the body above it (hops).
  readonly y: number;
  readonly lift: number;
  readonly scaleX: number;
  readonly scaleY: number;
  // Whole-body lean in radians, positive = toward the fire.
  readonly lean: number;
  readonly headTilt: number;
  // 0 = arms down, 1 = arms held out toward the fire.
  readonly armRaise: number;
}

export interface FireVisual {
  readonly visible: boolean;
  readonly scale: number;
  // 0..1 progress of the one-shot appearance burst, or null when not bursting.
  readonly burst: number | null;
  // Seconds of logical time for looping ember motion.
  readonly seconds: number;
}

// Provisional pacing fractions *within* a Wave (not real-time delays).
const NOTICE_FRACTION = 0.2;
const WALK_STEPS = 6;
const HOP_HEIGHT = 16;
const SHIVER_HZ = 14;
const SHIVER_AMPLITUDE = 2.5;
const LEAN_TOWARD_FIRE = 0.1;

const TAU = Math.PI * 2;
const DIRECTION = Math.sign(LAYOUT.fire.x - LAYOUT.humanStart.x) || 1;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;
const smoothstep = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const c = clamp01(t);
  return 1 + c3 * (c - 1) ** 3 + c1 * (c - 1) ** 2;
}

function shiver(clockMs: number, strength: number): number {
  return Math.sin((clockMs / 1000) * TAU * SHIVER_HZ) * SHIVER_AMPLITUDE * strength;
}

export function computeFireVisual(snapshot: SliceSnapshot): FireVisual {
  const seconds = snapshot.clockMs / 1000;
  const wave = snapshot.activeWave;
  const established = snapshot.world.fireStage >= 1;

  if (!wave && !established) {
    return { visible: false, scale: 0, burst: null, seconds };
  }

  const flicker =
    1 + 0.06 * Math.sin(seconds * TAU * 7) + 0.04 * Math.sin(seconds * TAU * 11.3);

  if (wave?.index === 0) {
    return {
      visible: true,
      scale: easeOutBack(wave.progress / 0.6) * flicker,
      burst: wave.progress,
      seconds,
    };
  }
  return { visible: true, scale: flicker, burst: null, seconds };
}

const GROUND_START = LAYOUT.humanStart;
const GROUND_WARM = LAYOUT.humanWarm;

export function computeHumanPose(snapshot: SliceSnapshot): HumanPose {
  const clock = snapshot.clockMs;
  const wave = snapshot.activeWave;

  const base = {
    x: GROUND_START.x,
    y: GROUND_START.y,
    lift: 0,
    scaleX: 1,
    scaleY: 1,
    lean: 0,
    headTilt: 0,
    armRaise: 0,
  };

  // Initial screen and Wave 1: cold, hunched, shivering.
  if (snapshot.phase === 'awaiting-input' || wave?.index === 0) {
    return {
      ...base,
      x: GROUND_START.x + shiver(clock, 1),
      scaleX: 1.03,
      scaleY: 0.94,
    };
  }

  // Wave 2: freeze and look, then hop to the fire.
  if (wave?.index === 1) {
    const p = wave.progress;
    if (p < NOTICE_FRACTION) {
      const u = p / NOTICE_FRACTION;
      const pop = Math.sin(Math.PI * Math.min(1, u * 2)) * (u < 0.5 ? 1 : 0);
      return {
        ...base,
        // No shiver: it stops for a moment while the human notices the fire.
        scaleX: lerp(1.03, 1, easeOutCubic(u)),
        scaleY: lerp(0.94, 1, easeOutCubic(u)) + 0.08 * pop,
        lean: DIRECTION * LEAN_TOWARD_FIRE * easeOutCubic(u),
        headTilt: DIRECTION * 0.35 * easeOutCubic(u),
      };
    }
    const q = (p - NOTICE_FRACTION) / (1 - NOTICE_FRACTION);
    const hopPhase = q * WALK_STEPS;
    const hop = Math.abs(Math.sin(Math.PI * hopPhase));
    const landing = (1 - hop) ** 3 * smoothstep(q / 0.08);
    return {
      ...base,
      x: lerp(GROUND_START.x, GROUND_WARM.x, q) + shiver(clock, 0.4),
      lift: hop * HOP_HEIGHT,
      scaleX: 1 + 0.08 * landing,
      scaleY: 1 - 0.08 * landing,
      lean: DIRECTION * LEAN_TOWARD_FIRE + 0.1 * Math.sin(Math.PI * hopPhase),
      headTilt: DIRECTION * 0.35 * (1 - smoothstep((q - 0.7) / 0.3)),
    };
  }

  const warm = { ...base, x: GROUND_WARM.x };

  // Wave 3: arrive, hold hands to the fire while the shiver fades, then relax.
  if (wave?.index === 2) {
    const p = wave.progress;
    const settle = easeOutCubic(p / 0.2);
    const relax = smoothstep((p - 0.7) / 0.3);
    const shiverStrength = 1 - smoothstep((p - 0.15) / 0.5);
    // Brief relieved stretch near the end.
    const relief = Math.sin(Math.PI * clamp01((p - 0.7) / 0.3));
    return {
      ...warm,
      x: GROUND_WARM.x + shiver(clock, shiverStrength * 0.6),
      lift: relief * 6,
      scaleX: lerp(1.08, 1, settle) - 0.02 * relief,
      scaleY: lerp(0.92, 1, settle) + 0.06 * relief,
      lean: DIRECTION * LEAN_TOWARD_FIRE * (1 - settle),
      headTilt: 0.12 * Math.sin((clock / 1000) * TAU * 0.8) * smoothstep(p / 0.2) * (1 - relax),
      armRaise: easeOutCubic(p / 0.2) * (1 - relax),
    };
  }

  // Completed: ready and idle. Gentle breathing, a look around, a small hop now and then.
  const seconds = clock / 1000;
  const hopCycle = (clock % 2600) / 2600;
  const hopLift = hopCycle < 0.18 ? Math.sin((Math.PI * hopCycle) / 0.18) * 7 : 0;
  return {
    ...warm,
    lift: hopLift,
    scaleY: 1 + 0.02 * Math.sin(seconds * TAU * 0.9),
    headTilt: 0.15 * Math.sin(seconds * TAU * 0.35),
  };
}
