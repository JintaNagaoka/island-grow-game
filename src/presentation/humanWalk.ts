import {
  HUMAN_WALK_DIRECTIONS,
  humanWalkTextureKey,
  type HumanWalkDirection,
  type HumanWalkPose,
  type HumanWalkTextureKey,
} from './humanAssets';
import type { Point } from './layout';

// Four-direction walk behavior for the approved walk frames. Movement and the
// step-cycle position are pure functions of logical milliseconds, so a global
// playback speed scales both together. The Phaser animations below define the
// frames, but the Scene pins their current frame to walkFrameIndexAt(); Phaser's
// own timer and animation completion never decide movement or any game rule.
// Frames carry no root motion: position comes only from walkToward().

// Mirrors public/assets/human/walk/animation.json (checked by a test).
export const HUMAN_WALK_SEQUENCE: readonly HumanWalkPose[] = ['step-a', 'stand', 'step-b', 'stand'];
export const HUMAN_WALK_FRAME_DURATION_MS = 100;
export const HUMAN_WALK_CYCLE_DURATION_MS = HUMAN_WALK_SEQUENCE.length * HUMAN_WALK_FRAME_DURATION_MS;
export const HUMAN_WALK_FRAME_RATE = 1000 / HUMAN_WALK_FRAME_DURATION_MS;

export type HumanWalkAnimationKey = `human-walk-${HumanWalkDirection}`;

export interface HumanWalkAnimationDefinition {
  readonly key: HumanWalkAnimationKey;
  readonly frameRate: number;
  readonly repeat: -1;
  // Four entries; the stand frame is referenced twice.
  readonly frames: readonly { readonly key: HumanWalkTextureKey }[];
}

export function humanWalkAnimationKey(direction: HumanWalkDirection): HumanWalkAnimationKey {
  return `human-walk-${direction}`;
}

// One looping Phaser animation per direction, registered by the Scene.
export const HUMAN_WALK_ANIMATIONS: readonly HumanWalkAnimationDefinition[] =
  HUMAN_WALK_DIRECTIONS.map((direction): HumanWalkAnimationDefinition => ({
    key: humanWalkAnimationKey(direction),
    frameRate: HUMAN_WALK_FRAME_RATE,
    repeat: -1,
    frames: HUMAN_WALK_SEQUENCE.map((pose) => ({ key: humanWalkTextureKey(direction, pose) })),
  }));

// Ground speed in design pixels per logical millisecond. Deliberately a plain
// tuning constant, not derived from the frame rate or the 100ms frame time.
// The final value is a human play-review decision.
export const HUMAN_WALK_SPEED_PX_PER_MS = 0.144;
// At or inside this remaining distance the human counts as arrived.
export const HUMAN_WALK_STOP_THRESHOLD_PX = 1;

export type HumanAnimationCommand =
  // Begin the animation (from its first frame), then pin the logical frame.
  | { readonly type: 'start'; readonly key: HumanWalkAnimationKey; readonly frameIndex: number }
  // Already playing this key: leave it running and only pin the logical frame.
  | { readonly type: 'pin'; readonly frameIndex: number }
  // Not walking but an animation is still running: stop it.
  | { readonly type: 'stop' }
  | { readonly type: 'none' };

// What the Scene must do with the human Sprite's animation this tick, given the
// key it is currently playing (null when idle). A walk animation starts only
// when the key changes, never restarts while the key stays the same, and stops
// as soon as the pose is no longer a walk (arrival, next Wave pose).
export function planHumanAnimation(
  playingKey: string | null,
  walk: { readonly animationKey: HumanWalkAnimationKey; readonly frameIndex: number } | null,
): HumanAnimationCommand {
  if (walk === null) return playingKey === null ? { type: 'none' } : { type: 'stop' };
  if (playingKey === walk.animationKey) return { type: 'pin', frameIndex: walk.frameIndex };
  return { type: 'start', key: walk.animationKey, frameIndex: walk.frameIndex };
}

// Dominant axis picks one of the four approved views; ties go horizontal.
// Returns null when the remaining distance is within the stop threshold.
export function selectWalkDirection(dx: number, dy: number): HumanWalkDirection | null {
  if (Math.hypot(dx, dy) <= HUMAN_WALK_STOP_THRESHOLD_PX) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy < 0 ? 'up' : 'down';
}

// Index into the 4-entry animation after `walkElapsedMs` of continuous walking:
// step-a -> stand -> step-b -> stand, 100ms each, looping.
export function walkFrameIndexAt(walkElapsedMs: number): number {
  const frame = Math.floor(Math.max(0, walkElapsedMs) / HUMAN_WALK_FRAME_DURATION_MS);
  return frame % HUMAN_WALK_SEQUENCE.length;
}

export function walkPoseAt(walkElapsedMs: number): HumanWalkPose {
  return HUMAN_WALK_SEQUENCE[walkFrameIndexAt(walkElapsedMs)];
}

export interface WalkStep {
  readonly x: number;
  readonly y: number;
  // View to show while moving; null once arrived (walking stops).
  readonly direction: HumanWalkDirection | null;
  readonly arrived: boolean;
}

// Position after walking from `from` toward `to` for `elapsedMs` at the fixed
// ground speed. The velocity is the unit vector toward the destination, so a
// diagonal is never faster than a straight line; the view comes from the
// dominant axis of the same vector. Arrival snaps exactly onto `to`.
export function walkToward(from: Point, to: Point, elapsedMs: number): WalkStep {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const travelled = Math.min(distance, HUMAN_WALK_SPEED_PX_PER_MS * Math.max(0, elapsedMs));
  if (distance - travelled <= HUMAN_WALK_STOP_THRESHOLD_PX) {
    return { x: to.x, y: to.y, direction: null, arrived: true };
  }
  return {
    x: from.x + (dx / distance) * travelled,
    y: from.y + (dy / distance) * travelled,
    direction: selectWalkDirection(dx, dy),
    arrived: false,
  };
}
