import type { Point } from './layout';

// Runtime world art for the initial / Turn 1 state. Every file is a derived
// 8-bit RGBA PNG (see README "World asset derivation"); the RGB checkerboard
// originals are never loaded. Sizes are the PNG pixel size and `groundAnchor`
// is the ground contact point in that pixel space, so a sprite whose origin is
// groundAnchor / size stands exactly on its placement point.
export const WORLD_ASSET_DIR = '/assets/world/initial-turn1/';

// 'design': placement is a position on the 720x1280 design canvas.
// 'island': placement is a ground point in the island PNG's own pixel space, so
// every prop stays registered to the island art whatever the island's scale.
export type PlacementSpace = 'design' | 'island';

export interface WorldAsset {
  readonly textureKey: string;
  readonly filename: string;
  readonly width: number;
  readonly height: number;
  readonly groundAnchor: Point;
  // Design pixels per PNG pixel.
  readonly baseScale: number;
  readonly placementSpace: PlacementSpace;
  readonly placement: Point;
  // Render the PNG mirrored left-right. groundAnchor stays in the unflipped PNG's
  // pixels; groundOrigin() converts it. The PNG itself is never edited.
  readonly flipX?: boolean;
}

// Sprite origin (0..1) that puts the asset's ground anchor on its placement
// point, taking flipX into account.
export function groundOrigin(asset: WorldAsset): Point {
  const x = asset.groundAnchor.x / asset.width;
  return { x: asset.flipX ? 1 - x : x, y: asset.groundAnchor.y / asset.height };
}

export const WORLD_ASSETS = {
  // Anchor: horizontal centre of the top edge, placed so the island fills the
  // world area above the UI panel with a small margin (see layout.ts).
  island: {
    textureKey: 'world-island',
    filename: 'island-base.png',
    width: 941,
    height: 1543,
    groundAnchor: { x: 470, y: 0 },
    baseScale: 0.68,
    placementSpace: 'design',
    placement: { x: 360, y: 16 },
  },
  // Provisional stage-1 shelter in the lower-left living area, level with the
  // human and fire. The art faces left, so it is mirrored: roof to the left, open
  // side toward the human and fire. Scale 0.37 gives about 78x57 logical px at
  // the 360x640 reference (target ~80x50).
  shelter: {
    textureKey: 'world-shelter',
    filename: 'shelter-stage1.png',
    width: 423,
    height: 306,
    groundAnchor: { x: 212, y: 296 },
    baseScale: 0.37,
    placementSpace: 'island',
    placement: { x: 282, y: 960 },
    flipX: true,
  },
  // The one white fantasy creature, grazing on the right-hand grass terrace.
  // The art faces left and is never mirrored.
  animal: {
    textureKey: 'world-animal',
    filename: 'animal-stage1.png',
    width: 512,
    height: 306,
    groundAnchor: { x: 290, y: 300 },
    baseScale: 0.15,
    placementSpace: 'island',
    placement: { x: 640, y: 690 },
  },
} as const satisfies Record<string, WorldAsset>;

// The campfire's two flicker frames (stage 1). Both PNGs share one canvas, one
// ground anchor (the base of the stone ring, bottom-centre) and one visible
// stone-ring width, so switching texture never moves the stones or the contact
// point; only the flame differs. Index 0 and 1 alternate on the logical clock.
const FIRE_FRAME_COMMON = {
  width: 256,
  height: 263,
  groundAnchor: { x: 128, y: 247 },
  baseScale: 0.22,
  placementSpace: 'island',
  placement: { x: 432, y: 971 },
} as const satisfies Omit<WorldAsset, 'textureKey' | 'filename'>;

export const FIRE_FRAMES = [
  { ...FIRE_FRAME_COMMON, textureKey: 'world-fire-a', filename: 'fire-stage1-a.png' },
  { ...FIRE_FRAME_COMMON, textureKey: 'world-fire-b', filename: 'fire-stage1-b.png' },
] as const satisfies readonly WorldAsset[];

// Appears at fireStage 1. Frame 0 carries the shared metadata for layout.
export const FIRE_ASSET: WorldAsset = FIRE_FRAMES[0];

export const WORLD_ASSET_LIST: readonly WorldAsset[] = [
  WORLD_ASSETS.island,
  WORLD_ASSETS.shelter,
  WORLD_ASSETS.animal,
  ...FIRE_FRAMES,
];

// Bright open-water blue behind the island's transparent margin; sampled from
// the island's own water so the cut-out edge never reads as a rectangle.
export const WORLD_WATER_COLOR = 0x1eb4f4;
