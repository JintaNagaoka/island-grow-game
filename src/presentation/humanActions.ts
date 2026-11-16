import type { HumanPose } from './animation';
import { HUMAN_FRAME_SIZE, HUMAN_SPRITE_SCALE } from './humanAssets';
import type { Point } from './layout';

// The existing TRUE-route human action candidates (art-source/true-route/human-action-candidates,
// mirrored byte-for-byte into public/assets/human/actions): gather, build, carry, dig and
// water-carry, two frames each, drawn facing RIGHT and mirrored at runtime. They are
// PROVISIONAL candidates, not approved art.
//
// Each PNG bakes the human together with its tool or load (a "composite work sprite").
// That is a deliberate, reported trade-off: the body pose is what makes the work legible,
// so the pose is used as drawn instead of an idle pose with a moving prop. Everything else
// stays its own layer: the building, the world state and the effects (chips, dust, dirt,
// splash) are separate records, and nothing here decides gameplay.
//
// Placement metadata is measured from the PNGs (checked by humanActions.test.ts):
//  - anchor: the ground point in the PNG's pixels. x is the midpoint of the extent of the two
//    feet (the tool or load that touches the ground is excluded); y is the lowest opaque row.
//    The feet therefore stay where they are when the frame changes, instead of the whole
//    figure sliding with its lean.
//  - headRadius: the largest inscribed circle of the cream head, in PNG pixels. Every frame is
//    scaled so its head matches the approved walking figure, which keeps the scale stable
//    across frames even though the generated canvases are not framed identically.
//  - contact: where the tool (or the load) meets the world, in PNG pixels, when it has one.

export const HUMAN_ACTION_DIR = '/assets/human/actions/';
export const ACTION_IDS = ['gather', 'build', 'carry', 'dig', 'water-carry'] as const;
export type ActionId = (typeof ACTION_IDS)[number];

// Mirrors art-source/true-route/human-action-candidates/animation.json: two frames,
// 300 ms each, repeating. The logical clock decides the frame; playback speed scales it.
export const ACTION_FRAME_MS = 300;

// The head radius the approved walk frames show (their measured radius is about 88 px).
export const TARGET_HEAD_RADIUS_PX = 89;

export interface ActionFrame {
  readonly textureKey: string;
  readonly filename: string;
  readonly anchor: Point;
  readonly headRadius: number;
  readonly contact?: Point;
}

const frame = (
  filename: string,
  anchor: Point,
  headRadius: number,
  contact?: Point,
): ActionFrame => ({ textureKey: `action-${filename.replace('.png', '')}`, filename, anchor, headRadius, contact });

export const ACTION_FRAMES: Readonly<Record<ActionId, readonly [ActionFrame, ActionFrame]>> = {
  // Mallet raised behind the shoulder, then brought down and forward. contact = the
  // mallet face in the strike frame.
  build: [
    frame('build-1.png', { x: 255, y: 479 }, 84.8),
    frame('build-2.png', { x: 172, y: 479 }, 94.3, { x: 465, y: 409 }),
  ],
  // Stooped at the stone, then lifting it. contact = the stone on the ground in frame 1.
  gather: [
    frame('gather-1.png', { x: 205, y: 479 }, 113, { x: 411, y: 445 }),
    frame('gather-2.png', { x: 213, y: 479 }, 104),
  ],
  carry: [frame('carry-1.png', { x: 251, y: 479 }, 97), frame('carry-2.png', { x: 258, y: 479 }, 99.8)],
  // Spade raised, then driven into the ground. contact = the blade tip in frame 2.
  dig: [
    frame('dig-a-candidate.png', { x: 244, y: 470 }, 83.4),
    frame('dig-b-candidate.png', { x: 214, y: 469 }, 83, { x: 360, y: 466 }),
  ],
  // A full bucket held in both hands, two walking steps. contact = the bucket rim.
  'water-carry': [
    frame('water-carry-a-candidate.png', { x: 250, y: 478 }, 97.6, { x: 297, y: 285 }),
    frame('water-carry-b-candidate.png', { x: 249, y: 473 }, 98, { x: 297, y: 285 }),
  ],
};

export const HUMAN_ACTION_ASSET_LIST: readonly ActionFrame[] = ACTION_IDS.flatMap((id) => ACTION_FRAMES[id]);

// Multiplier on HUMAN_SPRITE_SCALE that gives this frame the approved head size.
export const frameSizeMul = (target: ActionFrame): number => TARGET_HEAD_RADIUS_PX / target.headRadius;

// Which of the two frames shows `elapsedMs` into a step (frame 0 first).
export const actionFrameIndex = (elapsedMs: number): 0 | 1 =>
  (Math.floor(Math.max(0, elapsedMs) / ACTION_FRAME_MS) % 2) as 0 | 1;

// The pose of a resident working in place: the composite frame, its feet on `at`.
export function actionPose(action: ActionId, index: 0 | 1, at: Point, facing: -1 | 1): HumanPose {
  const target = ACTION_FRAMES[action][index];
  return {
    asset: target.textureKey,
    originX: target.anchor.x / HUMAN_FRAME_SIZE,
    originY: target.anchor.y / HUMAN_FRAME_SIZE,
    x: at.x,
    y: at.y,
    lift: 0,
    facing,
    walk: null,
    coldOverlay: false,
    sizeMul: frameSizeMul(target),
  };
}

// Design-pixel offset from the resident's ground point to the frame's contact point,
// mirrored with the facing. Undefined for a frame without one.
export function contactOffset(action: ActionId, index: 0 | 1, facing: -1 | 1): Point | null {
  const target = ACTION_FRAMES[action][index];
  if (target.contact === undefined) return null;
  const scale = HUMAN_SPRITE_SCALE * frameSizeMul(target);
  return {
    x: facing * (target.contact.x - target.anchor.x) * scale,
    y: (target.contact.y - target.anchor.y) * scale,
  };
}

// Reach of the mallet face in the strike frame: how far ahead of and above the feet the
// face lands. Layout derives the builders' standing points from it, so the face meets the wall.
export const BUILD_STRIKE_REACH: Point = (() => {
  const offset = contactOffset('build', 1, 1)!;
  return { x: offset.x, y: -offset.y };
})();
