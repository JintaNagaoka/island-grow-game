import type { SliceSnapshot } from '../game/sliceGame';
import { LAYOUT } from './layout';

// Pure visual state derived from the authoritative game snapshot. Phaser only
// consumes these values; presentation motion never decides gameplay outcomes.
export interface HumanPose {
  readonly x: number;
  readonly y: number;
  readonly lift: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly lean: number;
  readonly headTilt: number;
  readonly facing: -1 | 1;
  readonly leftArmAngle: number;
  readonly rightArmAngle: number;
  readonly leftLegAngle: number;
  readonly rightLegAngle: number;
  readonly leftFootLift: number;
  readonly rightFootLift: number;
  // 1 = curled up on the ground, 0 = standing.
  readonly sit: number;
  // Visual cold cues fade during warm-up; WorldState remains authoritative.
  readonly coldAmount: number;
  readonly shiverAmount: number;
  readonly effectPhase: number;
}

export interface FireVisual {
  readonly visible: boolean;
  readonly scale: number;
  readonly burst: number | null;
  readonly seconds: number;
}

export interface EnvironmentMotion {
  readonly treeSways: readonly number[];
  readonly animalOffsets: readonly { x: number; y: number; turn: number }[];
}

const NOTICE_END = 0.18;
const STAND_END = 0.42;
const TURN_END = 0.52;
const WALK_CYCLES = 4;
const TAU = Math.PI * 2;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
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

export function computeFireVisual(snapshot: SliceSnapshot): FireVisual {
  const seconds = snapshot.clockMs / 1000;
  const wave = snapshot.activeWave;
  const established = snapshot.world.fireStage >= 1;
  if (!wave && !established) return { visible: false, scale: 0, burst: null, seconds };

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

export function computeEnvironmentMotion(snapshot: SliceSnapshot): EnvironmentMotion {
  const seconds = snapshot.clockMs / 1000;
  const treeCount = LAYOUT.trees.length + LAYOUT.foreground.length;
  return {
    treeSways: Array.from({ length: treeCount }, (_, index) =>
      Math.sin(seconds * 0.8 + index * 1.7) * 0.025,
    ),
    animalOffsets: LAYOUT.animals.map((_, index) => {
      const phase = seconds * (0.55 + index * 0.08) + index * 2.3;
      return {
        x: Math.sin(phase) * 5,
        y: Math.sin(phase * 2) * 1.5,
        turn: Math.sin(phase * 0.45),
      };
    }),
  };
}

export function computeHumanPose(snapshot: SliceSnapshot): HumanPose {
  const clock = snapshot.clockMs;
  const seconds = clock / 1000;
  const wave = snapshot.activeWave;
  const base: HumanPose = {
    x: LAYOUT.humanStart.x,
    y: LAYOUT.humanStart.y,
    lift: 0,
    scaleX: 1,
    scaleY: 1,
    lean: 0,
    headTilt: 0,
    facing: 1,
    leftArmAngle: 0.18,
    rightArmAngle: -0.18,
    leftLegAngle: 0,
    rightLegAngle: 0,
    leftFootLift: 0,
    rightFootLift: 0,
    sit: 0,
    coldAmount: snapshot.world.isCold ? 1 : 0,
    shiverAmount: snapshot.world.isCold ? 1 : 0,
    effectPhase: seconds * TAU * 3.2,
  };

  // Cold: the body stays legible and still while animated marks carry the
  // rapid tremble. The seated silhouette hugs both knees.
  if (snapshot.phase === 'awaiting-input' || wave?.index === 0) {
    return {
      ...base,
      sit: 1,
      scaleY: 0.96 + Math.sin(seconds * TAU * 0.7) * 0.008,
      lean: -0.08,
      headTilt: -0.08,
      facing: -1,
      leftArmAngle: -0.45,
      rightArmAngle: 0.45,
      leftLegAngle: 0.8,
      rightLegAngle: -0.8,
    };
  }

  if (wave?.index === 1) {
    const p = wave.progress;

    // First react while still holding the knees. A small upper-body lift reads
    // as attention without beginning locomotion.
    if (p < NOTICE_END) {
      const notice = smoothstep(p / NOTICE_END);
      return {
        ...base,
        sit: 1,
        facing: -1,
        lean: lerp(-0.08, 0.02, notice),
        headTilt: lerp(-0.08, 0.18, notice),
      };
    }

    // Release the knees and rise fully before changing direction.
    if (p < STAND_END) {
      const stand = smoothstep((p - NOTICE_END) / (STAND_END - NOTICE_END));
      return {
        ...base,
        sit: 1 - stand,
        facing: -1,
        lean: lerp(0.02, 0, stand),
        headTilt: lerp(0.18, 0, stand),
        leftArmAngle: lerp(-0.45, 0.18, stand),
        rightArmAngle: lerp(0.45, -0.18, stand),
        leftLegAngle: lerp(0.8, 0, stand),
        rightLegAngle: lerp(-0.8, 0, stand),
      };
    }

    // A separate pause makes the turn toward the new fire intentional.
    if (p < TURN_END) {
      const turn = smoothstep((p - STAND_END) / (TURN_END - STAND_END));
      return {
        ...base,
        facing: turn < 0.5 ? -1 : 1,
        scaleX: 1 - Math.sin(turn * Math.PI) * 0.18,
        headTilt: 0.12 * Math.sin(turn * Math.PI),
      };
    }

    // Walk: a short-legged, slightly bouncy alternating gait. One foot stays
    // planted while the opposite foot swings.
    const q = clamp01((p - TURN_END) / (1 - TURN_END));
    const cycle = Math.sin(q * WALK_CYCLES * TAU);
    const leftSwing = Math.max(0, cycle);
    const rightSwing = Math.max(0, -cycle);
    return {
      ...base,
      x: lerp(LAYOUT.humanStart.x, LAYOUT.humanWarm.x, smoothstep(q)),
      lift: Math.abs(cycle) * 1.8,
      lean: 0.06 + cycle * 0.02,
      headTilt: 0.1 * (1 - smoothstep((q - 0.75) / 0.25)),
      leftArmAngle: cycle * 0.38,
      rightArmAngle: -cycle * 0.38,
      // The rear leg stays nearly vertical as the opposite foot swings. At
      // least one foot therefore remains visibly planted throughout a step.
      leftLegAngle: leftSwing * 0.55 - rightSwing * 0.1,
      rightLegAngle: rightSwing * 0.55 - leftSwing * 0.1,
      leftFootLift: leftSwing * 3.5,
      rightFootLift: rightSwing * 3.5,
    };
  }

  const warmBase: HumanPose = { ...base, x: LAYOUT.humanWarm.x };

  // Warm up: both feet plant and both arms reach toward the fire.
  if (wave?.index === 2) {
    const p = wave.progress;
    const reach = easeOutCubic(p / 0.2) * (1 - smoothstep((p - 0.76) / 0.24));
    const relief = Math.sin(Math.PI * clamp01((p - 0.72) / 0.28));
    const remainingCold = 1 - smoothstep((p - 0.18) / 0.7);
    return {
      ...warmBase,
      lift: relief * 3,
      scaleY: 1 + relief * 0.035,
      lean: 0.12 * reach,
      headTilt: 0.12 * reach,
      // Slightly separated angles keep both reaching arms readable at the
      // miniature scale instead of collapsing into one line.
      leftArmAngle: lerp(0.18, -1.02, reach),
      rightArmAngle: lerp(-0.18, -1.3, reach),
      leftLegAngle: -0.08,
      rightLegAngle: 0.08,
      coldAmount: remainingCold,
      shiverAmount: remainingCold,
    };
  }

  // Ready idle: breathe, look around and occasionally shift weight.
  const weight = Math.sin(seconds * TAU * 0.38);
  return {
    ...warmBase,
    lift: Math.max(0, Math.sin(((clock % 3200) / 3200) * TAU) - 0.92) * 18,
    scaleY: 1 + 0.012 * Math.sin(seconds * TAU * 0.8),
    lean: weight * 0.025,
    headTilt: weight * 0.13,
    leftArmAngle: 0.18 + weight * 0.08,
    rightArmAngle: -0.18 - weight * 0.08,
    leftLegAngle: weight * 0.05,
    rightLegAngle: -weight * 0.05,
  };
}
