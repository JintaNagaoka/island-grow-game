import type { SliceSnapshot } from '../game/sliceGame';
import { LAYOUT } from './layout';

// Pure visual state derived from the authoritative game snapshot. Phaser only
// consumes these values; presentation motion never decides gameplay outcomes.
export interface HumanPose {
  readonly asset: HumanAsset;
  readonly x: number;
  readonly y: number;
  readonly lift: number;
  readonly facing: -1 | 1;
}

export const HUMAN_ASSETS = {
  idle: 'human-idle',
  side: 'human-side',
  walk: 'human-walk',
  run: 'human-run',
  crouch: 'human-crouch',
  sit: 'human-sit',
  hugKnees: 'human-hug-knees',
  cold: 'human-cold',
} as const;

export type HumanAsset = (typeof HUMAN_ASSETS)[keyof typeof HUMAN_ASSETS];

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
  const seconds = snapshot.clockMs / 1000;
  const wave = snapshot.activeWave;
  const base: HumanPose = {
    asset: HUMAN_ASSETS.idle,
    x: LAYOUT.humanStart.x,
    y: LAYOUT.humanStart.y,
    lift: 0,
    facing: 1,
  };

  // The approved cold PNG already contains the curled pose, blue head and
  // zigzags. Keep the image completely still; no body shiver is added.
  if (snapshot.phase === 'awaiting-input' || wave?.index === 0) {
    return { ...base, asset: HUMAN_ASSETS.cold };
  }

  if (wave?.index === 1) {
    const p = wave.progress;

    // Notice the newly established fire before changing pose or position.
    if (p < NOTICE_END) {
      return { ...base, asset: HUMAN_ASSETS.cold };
    }

    // The supplied crouch pose provides the intermediate rise without
    // redrawing or morphing the approved character art.
    if (p < STAND_END) {
      return { ...base, asset: HUMAN_ASSETS.crouch };
    }

    // A separate side-on standing beat makes attention and direction clear.
    if (p < TURN_END) {
      return { ...base, asset: HUMAN_ASSETS.side };
    }

    // Issue #3 has one approved walk frame and no walk-B. Keep this explicitly
    // provisional: move human-walk with a restrained vertical bob, and do not
    // fake an A/B cycle by mirroring, deforming, or combining other poses. A
    // true two-frame gait requires a future user-approved walk-B asset.
    const q = clamp01((p - TURN_END) / (1 - TURN_END));
    const cycle = Math.sin(q * WALK_CYCLES * TAU);
    return {
      ...base,
      asset: HUMAN_ASSETS.walk,
      x: lerp(LAYOUT.humanStart.x, LAYOUT.humanWarm.x, smoothstep(q)),
      lift: Math.abs(cycle) * 2,
    };
  }

  // Near the fire, use the approved knees-hugged pose while the warm-up Wave
  // is still authoritative. The normal idle asset appears only after it ends.
  if (wave?.index === 2) {
    return {
      ...base,
      asset: HUMAN_ASSETS.hugKnees,
      x: LAYOUT.humanWarm.x,
    };
  }

  // Completion switches to the normal cream idle image. A subtle whole-image
  // bob keeps the scene alive without changing the approved drawing.
  return {
    ...base,
    asset: HUMAN_ASSETS.idle,
    x: LAYOUT.humanWarm.x,
    lift: Math.max(0, Math.sin(seconds * TAU * 0.45)) * 1.2,
  };
}
