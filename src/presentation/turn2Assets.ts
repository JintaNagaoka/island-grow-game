import { HUMAN_ASSETS } from './humanAssets';
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
// Reference), above the hut and clear of the central growth space.
const PLOT_PLACEMENT: Point = { x: 330, y: 745 };

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

// --- Animation contract (frame order, 300 ms per frame, repeat). Texture keys
// are the single source for both the loader and the Scene.
export const TURN2_FRAME_DURATION_MS = 300;

// farm_water: the existing approved human idle first, then water1. The idle
// frame is the repository's own approved art (texture key 'idle'); no external
// placeholder file is ever loaded. It is drawn with its own approved origin and
// the shared human scale, standing where the human stands in water1.
export const FARM_WATER_IDLE_TEXTURE_KEY = HUMAN_ASSETS.idle.normal.textureKey;
// The human's feet in water1, in that PNG's pixels (the lowest cream pixels of
// the figure, measured from the supplied art). Standing the idle frame there
// keeps the human put when the two frames alternate.
export const FARM_WATER_HUMAN_FEET: Point = { x: 182, y: 404 };

export interface Turn2Animation {
  readonly id: 'farm_harvest' | 'farm_water' | 'animal_eat' | 'cook_steam';
  readonly frameTextureKeys: readonly string[];
  readonly frameDurationMs: number;
  readonly repeat: true;
}

export const TURN2_ANIMATIONS: readonly Turn2Animation[] = [
  {
    id: 'farm_harvest',
    frameTextureKeys: FARM_HARVEST_FRAMES.map((frame) => frame.textureKey),
    frameDurationMs: TURN2_FRAME_DURATION_MS,
    repeat: true,
  },
  {
    id: 'farm_water',
    frameTextureKeys: [FARM_WATER_IDLE_TEXTURE_KEY, FARM_WATER_FRAME.textureKey],
    frameDurationMs: TURN2_FRAME_DURATION_MS,
    repeat: true,
  },
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
  ...ANIMAL_EAT_FRAMES,
  ...COOK_STEAM_FRAMES,
  HUT_ASSET,
];
