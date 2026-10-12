import { FARM_WORK_MS } from '../game/timing';
import type { Point } from './layout';
import { FIRE_ASSET, WORLD_ASSETS, type WorldAsset } from './worldAssets';

// Runtime art for Turn 2 (🌱). The seven animation PNGs are the supplied
// turn2_assets_review_v2.zip files, added byte-for-byte; the hut is derived from
// the approved hut JPEG (see README "Turn 2 asset derivation"). All metadata the
// Scene needs lives here: texture key, file, pixel size, ground anchor, scale
// and placement. Anchors are in each PNG's own pixels: x is the centre of the
// grounded art's opaque bounds and y its bottom (the largest 8-connected group
// at alpha >= 128; the animals' detached caption text is excluded). Every frame
// of an animation shares one on-screen ground point, so frame switches never hop.

export const FARM_ASSET_DIR = '/assets/human/farm/';
export const TURN2_WORLD_ASSET_DIR = '/assets/world/turn2/';

export interface Turn2Frame extends WorldAsset {
  // Directory the file is served from, with a trailing slash.
  readonly dir: string;
}

// All ZIP frames are 512x512 RGBA canvases.
export const TURN2_FRAME_SIZE = 512;

// --- Plot: the supplied composite farm-work art (human + sprout plot in one PNG).
// The plot's ground point on the island; every farm frame is anchored to it.
// Left-middle grass terrace at about the animal's height (the Turn 2 Visual
// Reference), above the hut. It sits far enough left that the whole expanded farm
// (the Human, this composite and the standalone tiles to its right) stays left of
// the central growth space.
const PLOT_PLACEMENT: Point = { x: 225, y: 724 };

// The farm frames draw the Human much smaller on their 512px canvas than the
// approved Human PNGs do (head about 97 px wide against about 200-220 px), so the
// composite needs a larger scale for the Human to look the same size in game. 0.22
// puts the farm Human's head at about 22 design px, matching the approved idle and
// walk Humans at HUMAN_SPRITE_SCALE (measured by a test; see turn2Assets.test.ts).
// The approved Human sprite scale itself is unchanged.
export const FARM_BASE_SCALE = 0.22;

const FARM_COMMON = {
  width: TURN2_FRAME_SIZE,
  height: TURN2_FRAME_SIZE,
  baseScale: FARM_BASE_SCALE,
  placementSpace: 'island',
  placement: PLOT_PLACEMENT,
  dir: FARM_ASSET_DIR,
} as const satisfies Omit<Turn2Frame, 'textureKey' | 'filename' | 'groundAnchor'>;

export const FARM_HARVEST_FRAMES = [
  { ...FARM_COMMON, textureKey: 'farm-harvest-1', filename: 'human_farm_harvest1.png', groundAnchor: { x: 289, y: 479 } },
  { ...FARM_COMMON, textureKey: 'farm-harvest-2', filename: 'human_farm_harvest2.png', groundAnchor: { x: 309, y: 479 } },
] as const satisfies readonly Turn2Frame[];

// --- Standalone plot component (farm-plot-four-plants.png): a four-plant plot,
// derived from the approved JPEG by removing only its exterior-connected white
// background (scripts/deriveFarmPlotAsset.mjs; the plot art is untouched). Repeated
// copies grow the farm to the Visual Reference's size. Anchor: bottom centre of
// the art's visible bounds (the same convention as every other frame).
export const FARM_PLOT_TILE: Turn2Frame = {
  textureKey: 'farm-plot-four-plants',
  filename: 'farm-plot-four-plants.png',
  dir: TURN2_WORLD_ASSET_DIR,
  width: 448,
  height: 295,
  groundAnchor: { x: 224, y: 294 },
  baseScale: 0.08,
  placementSpace: 'island',
  placement: PLOT_PLACEMENT,
};

// Plant size match. Per-plant canopy (leaf + outline) area is about 10,200 px² in
// this art and about 1,450 px² in the plants embedded in human_farm_harvest1/2
// (4 plants, about 5,800 px², drawn at FARM_BASE_SCALE 0.22). Equal on-screen
// canopy needs a linear scale of sqrt(1450 / 10200) * 0.22 = 0.083; 0.08 is used.
// The approved Human and composite scale (FARM_BASE_SCALE) is untouched.

// Isometric geometry in the component PNG's pixels, measured from its four plants:
// the plant lattice has a pitch of about (113, 62) px, so a neighbouring component
// (2 plants along each axis) is (226, 124) px away. The plants' centroid is 8 px
// right of the anchor and 171 px above it.
export const FARM_TILE_STEP_PX: Point = { x: 226, y: 124 };
export const FARM_TILE_CENTER_FROM_ANCHOR_PX: Point = { x: 8, y: -171 };
// The centre of the plot drawn inside human_farm_harvest1.png (its own 2x2 plants),
// relative to that frame's ground anchor, in its pixels. The expansion components
// are laid out on the same grid around it, the composite being the grid's first cell.
export const FARM_COMPOSITE_PLOT_CENTER_PX: Point = { x: 14, y: -58 };
// The farm grid in component cells: `along` runs down-right, `across` runs up-right.
// The composite plot is the cell where both indices are 0; every other cell gets
// one standalone component. 2 x 2 cells = the composite plus 3 components, 16 plants
// in all (the Visual Reference has about 12). `spacing` multiplies the contact
// distance (FARM_TILE_STEP_PX) between neighbouring patches, so grass shows between
// the soil patches like the reference's, and the footprint stays near the
// reference's without adding copies or enlarging the plants.
export const FARM_GRID = { along: 2, across: 2, compositeCells: 1, spacing: 2 } as const;

export const FARM_WATER_FRAME: Turn2Frame = {
  ...FARM_COMMON,
  textureKey: 'farm-water-1',
  filename: 'human_farm_water1.png',
  groundAnchor: { x: 280, y: 479 },
};

// --- Cooking fire: the campfire levelled up. It stands on the campfire's own
// ground point and replaces it (never beside it). Scale 0.22 gives its stone ring
// the same ~56 design px width as the campfire's.
const POT_COMMON = {
  width: TURN2_FRAME_SIZE,
  height: TURN2_FRAME_SIZE,
  baseScale: 0.22,
  placementSpace: 'island',
  placement: FIRE_ASSET.placement,
  dir: TURN2_WORLD_ASSET_DIR,
} as const satisfies Omit<Turn2Frame, 'textureKey' | 'filename' | 'groundAnchor'>;

export const COOK_STEAM_FRAMES = [
  { ...POT_COMMON, textureKey: 'cook-steam-1', filename: 'cook_pot_steam1.png', groundAnchor: { x: 254, y: 479 } },
  { ...POT_COMMON, textureKey: 'cook-steam-2', filename: 'cook_pot_steam2.png', groundAnchor: { x: 278, y: 479 } },
] as const satisfies readonly Turn2Frame[];

// --- The one animal, levelled up to eating: replaces the grazing art at the animal's
// own ground point (never beside it). The frames carry a bowl of greens and a baked-in caption (accepted).
const ANIMAL_EAT_COMMON = {
  width: TURN2_FRAME_SIZE,
  height: TURN2_FRAME_SIZE,
  baseScale: 0.27,
  placementSpace: 'island',
  placement: WORLD_ASSETS.animal.placement,
  dir: TURN2_WORLD_ASSET_DIR,
} as const satisfies Omit<Turn2Frame, 'textureKey' | 'filename' | 'groundAnchor'>;

export const ANIMAL_EAT_FRAMES = [
  { ...ANIMAL_EAT_COMMON, textureKey: 'animal-eat-1', filename: 'animal_eat1.png', groundAnchor: { x: 239, y: 450 } },
  { ...ANIMAL_EAT_COMMON, textureKey: 'animal-eat-2', filename: 'animal_eat2.png', groundAnchor: { x: 311, y: 450 } },
] as const satisfies readonly Turn2Frame[];

// --- The hut that the rain shelter levels up into. Derived runtime PNG: the
// exterior-connected white of the approved JPEG made transparent, trimmed and
// shrunk to 512 wide. Anchored at the bottom centre and placed on the shelter's
// own ground point, so it replaces the shelter where it stood.
export const HUT_ASSET: Turn2Frame = {
  textureKey: 'world-hut',
  filename: 'hut-stage2.png',
  dir: TURN2_WORLD_ASSET_DIR,
  width: 512,
  height: 435,
  groundAnchor: { x: 256, y: 428 },
  baseScale: 0.3,
  placementSpace: 'island',
  placement: WORLD_ASSETS.shelter.placement,
};

// --- Looping animation contract (frame order, 300 ms per frame, repeat) for the
// animal and the cooking fire. Texture keys are the single source for both the
// loader and the Scene.
export const TURN2_FRAME_DURATION_MS = 300;

// The human's feet in water1, in that PNG's pixels (the lowest cream pixels of
// the figure, measured from the supplied art). The standing idle Human waits there,
// so the swap to the water1 composite does not move the Human.
export const FARM_WATER_HUMAN_FEET: Point = { x: 182, y: 404 };

// The farm-work sequence after the Human reaches the plot (logical clock, once):
// water1 for exactly 1.5 s, harvest2 for exactly 1.5 s, then settle on harvest1
// while the standalone tiles grow in (see the farm-expands Wave). Frames are held,
// not alternated: each pose is one continuous frame.
export const FARM_WORK_SEQUENCE = [
  { id: 'water', textureKey: FARM_WATER_FRAME.textureKey, durationMs: FARM_WORK_MS.humanWatersPlot },
  { id: 'harvest', textureKey: FARM_HARVEST_FRAMES[1].textureKey, durationMs: FARM_WORK_MS.humanHarvestsPlot },
  { id: 'settle', textureKey: FARM_HARVEST_FRAMES[0].textureKey, durationMs: null },
] as const;

export interface Turn2Animation {
  readonly id: 'animal_eat' | 'cook_steam';
  readonly frameTextureKeys: readonly string[];
  readonly frameDurationMs: number;
  readonly repeat: true;
}

export const TURN2_ANIMATIONS: readonly Turn2Animation[] = [
  {
    id: 'animal_eat',
    frameTextureKeys: ANIMAL_EAT_FRAMES.map((frame) => frame.textureKey),
    frameDurationMs: TURN2_FRAME_DURATION_MS,
    repeat: true,
  },
  {
    id: 'cook_steam',
    frameTextureKeys: COOK_STEAM_FRAMES.map((frame) => frame.textureKey),
    frameDurationMs: TURN2_FRAME_DURATION_MS,
    repeat: true,
  },
];

// Everything the Scene loads for Turn 2. The human idle frame is already loaded
// with the approved human assets.
export const TURN2_ASSET_LIST: readonly Turn2Frame[] = [
  ...FARM_HARVEST_FRAMES,
  FARM_WATER_FRAME,
  FARM_PLOT_TILE,
  ...ANIMAL_EAT_FRAMES,
  ...COOK_STEAM_FRAMES,
  HUT_ASSET,
];
