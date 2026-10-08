import type { SliceSnapshot } from '../game/sliceGame';
import {
  humanAssetOrigin,
  humanWalkTextureKey,
  selectHumanAsset,
  HUMAN_WALK_ORIGIN,
  type HumanAnimationState,
  type HumanWalkDirection,
} from './humanAssets';
import {
  HUMAN_WALK_SPEED_PX_PER_MS,
  humanWalkAnimationKey,
  selectWalkDirection,
  walkFrameIndexAt,
  walkPoseAt,
  walkToward,
  type HumanWalkAnimationKey,
} from './humanWalk';
import { LAYOUT, type Point } from './layout';

export interface HumanWalkVisual {
  readonly direction: HumanWalkDirection;
  readonly animationKey: HumanWalkAnimationKey;
  // Frame of the 4-entry animation selected by the logical clock.
  readonly frameIndex: number;
}

// Pure visual state derived from the authoritative game snapshot. Phaser only
// consumes these values; presentation motion never decides gameplay outcomes.
export interface HumanPose {
  // Texture key. For a walk pose this is the frame `walk.frameIndex` shows.
  readonly asset: string;
  // Sprite origin (0..1) that places the asset's ground anchor at (x, y).
  readonly originX: number;
  readonly originY: number;
  readonly x: number;
  readonly y: number;
  readonly lift: number;
  readonly facing: -1 | 1;
  // Set only while one of the approved walk animations is playing.
  readonly walk: HumanWalkVisual | null;
  // Cold marks to layer over a walk frame. Always follows WorldState.isCold and
  // is never inferred from the pose; every other pose selects an approved
  // normal/isCold PNG by isCold alone.
  readonly coldOverlay: boolean;
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

// Beat boundary inside the approach Wave, as a fraction of its logical length;
// the walk begins here. Provisional timing: a human play-review decision.
const WALK_START = 0.52;
const TAU = Math.PI * 2;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
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

// One frame of the approved walk at `step`, `walkElapsedMs` into the current
// leg. The view comes from the movement direction, the cold overlay only from
// isCold, and facing stays 1 because the left PNGs are supplied, never flipped.
function walkingPose(
  step: { readonly x: number; readonly y: number },
  direction: HumanWalkDirection,
  walkElapsedMs: number,
  isCold: boolean,
): HumanPose {
  return {
    asset: humanWalkTextureKey(direction, walkPoseAt(walkElapsedMs)),
    originX: HUMAN_WALK_ORIGIN.x,
    originY: HUMAN_WALK_ORIGIN.y,
    x: step.x,
    y: step.y,
    lift: 0,
    facing: 1,
    walk: {
      direction,
      animationKey: humanWalkAnimationKey(direction),
      frameIndex: walkFrameIndexAt(walkElapsedMs),
    },
    coldOverlay: isCold,
  };
}

// A still pose from the approved registry. isCold alone picks the normal or
// isCold PNG; the cold treatment is already part of that art.
function stillPose(
  state: HumanAnimationState,
  isCold: boolean,
  position: Point,
  lift = 0,
): HumanPose {
  const metadata = selectHumanAsset(state, isCold);
  const origin = humanAssetOrigin(metadata);
  return {
    asset: metadata.textureKey,
    originX: origin.x,
    originY: origin.y,
    x: position.x,
    y: position.y,
    lift,
    facing: 1,
    walk: null,
    coldOverlay: false,
  };
}

export function computeHumanPose(snapshot: SliceSnapshot): HumanPose {
  const seconds = snapshot.clockMs / 1000;
  const wave = snapshot.activeWave;
  const isCold = snapshot.world.isCold;

  // The approved cold PNG already contains the curled pose, blue head and
  // zigzags. Keep the image completely still; no body shiver is added.
  if (snapshot.phase === 'awaiting-input' || wave?.index === 0) {
    return stillPose('cold', isCold, LAYOUT.humanStart);
  }

  if (wave?.index === 1) {
    const p = wave.progress;

    // Notice the newly established fire until the walk starts. The notice art
    // already shows the human standing, so there is no separate rise pose.
    if (p < WALK_START) return stillPose('notice', isCold, LAYOUT.humanStart);

    // Walk to the fire at the fixed ground speed in logical time since the
    // walk began (the Wave's own elapsed time, whatever its duration). Arrival,
    // not the Wave clock, stops the walk and hands over to the next Wave's
    // pose; Wave completion and isCold stay owned by SliceGame.
    const walkElapsedMs = wave.elapsedMs - wave.durationMs * WALK_START;
    const step = walkToward(LAYOUT.humanStart, LAYOUT.humanWarm, walkElapsedMs);
    if (step.direction === null) return stillPose('warm', isCold, step);
    return walkingPose(step, step.direction, walkElapsedMs, isCold);
  }

  // Near the fire the approved warm pose plays out the warm-up Wave. isCold is
  // still true until game logic completes that Wave, so this is warm_isCold.
  if (wave?.index === 2) return stillPose('warm', isCold, LAYOUT.humanWarm);

  // Completion: isCold is now false, so the normal idle PNG is selected. A
  // subtle whole-image bob keeps the scene alive without changing the drawing.
  return stillPose(
    'idle',
    isCold,
    LAYOUT.humanWarm,
    Math.max(0, Math.sin(seconds * TAU * 0.45)) * 1.2,
  );
}

interface PreviewLeg {
  readonly from: Point;
  readonly to: Point;
  readonly direction: HumanWalkDirection;
  readonly durationMs: number;
}

const WALK_PREVIEW_LEGS: readonly PreviewLeg[] = LAYOUT.humanWalkPreview.map((from, index) => {
  const to = LAYOUT.humanWalkPreview[(index + 1) % LAYOUT.humanWalkPreview.length];
  const direction = selectWalkDirection(to.x - from.x, to.y - from.y);
  if (direction === null) throw new RangeError('walk preview legs must have length');
  return {
    from,
    to,
    direction,
    durationMs: Math.hypot(to.x - from.x, to.y - from.y) / HUMAN_WALK_SPEED_PX_PER_MS,
  };
});
const WALK_PREVIEW_LOOP_MS = WALK_PREVIEW_LEGS.reduce((sum, leg) => sum + leg.durationMs, 0);

// Dev-only review pose: loops the human right, down, left, up through the same
// walkToward() as Wave 2, from the logical clock alone. Each leg restarts the
// step cycle at step-a, as a direction change does. isCold is passed in from
// the snapshot so the cold overlay can be reviewed on and off.
export function computeWalkPreviewPose(clockMs: number, isCold: boolean): HumanPose {
  let legTimeMs = clockMs % WALK_PREVIEW_LOOP_MS;
  const lastLeg = WALK_PREVIEW_LEGS[WALK_PREVIEW_LEGS.length - 1];
  const leg =
    WALK_PREVIEW_LEGS.find((candidate) => {
      if (legTimeMs < candidate.durationMs) return true;
      legTimeMs -= candidate.durationMs;
      return false;
    }) ?? lastLeg;
  const step = walkToward(leg.from, leg.to, legTimeMs);
  return walkingPose(step, leg.direction, legTimeMs, isCold);
}
