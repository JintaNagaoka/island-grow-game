import type { WorldAsset } from './worldAssets';

export const TURN3_WORLD_ASSET_DIR = '/assets/world/turn3/';
export const TURN3_ACTION_ASSET_DIR = '/assets/human/actions/';
export const TURN3_ASSET_STATUS = 'provisional' as const;

export interface Turn3Asset extends WorldAsset {
  readonly dir: string;
  readonly status: typeof TURN3_ASSET_STATUS;
}

const world = (
  textureKey: string,
  filename: string,
  placement: { readonly x: number; readonly y: number },
  baseScale: number,
): Turn3Asset => ({
  textureKey,
  filename,
  width: 512,
  height: 512,
  groundAnchor: { x: 256, y: 480 },
  baseScale,
  placementSpace: 'island',
  placement,
  dir: TURN3_WORLD_ASSET_DIR,
  status: TURN3_ASSET_STATUS,
});

// Placements use the island PNG coordinate system. They are intentionally kept
// in this registry so visual review can tune composition without changing game
// rules or generated PNGs.
export const TURN3_WORLD_ASSETS = {
  matureFarm: world('turn3-mature-farm', 'mature-farm.png', { x: 334, y: 674 }, 0.26),
  secondHut: world('turn3-second-hut', 'hut-second.png', { x: 520, y: 905 }, 0.25),
  stoneWorkshop: world('turn3-stone-workshop', 'stone-workshop.png', { x: 480, y: 765 }, 0.25),
  // Supplies sit at the baked island cave mouth (upper-left), rather than
  // becoming a separate campsite beside the tree.
  practicalCave: world('turn3-practical-cave', 'cave-practical.png', { x: 470, y: 210 }, 0.13),
  dryRiverbed: world('turn3-dry-riverbed', 'dry-riverbed.png', { x: 470, y: 1070 }, 0.36),
  livestockParent: world('turn3-livestock-parent', 'livestock-parent.png', { x: 625, y: 705 }, 0.18),
  livestockChild: world('turn3-livestock-child', 'livestock-child.png', { x: 568, y: 710 }, 0.14),
  fence: world('turn3-fence', 'fence.png', { x: 600, y: 735 }, 0.29),
  feedTrough: world('turn3-feed-trough', 'feed-trough.png', { x: 540, y: 725 }, 0.12),
  waterTrough: world('turn3-water-trough', 'water-trough.png', { x: 675, y: 725 }, 0.12),
} as const satisfies Record<string, Turn3Asset>;

export const TURN3_WORLD_ASSET_LIST: readonly Turn3Asset[] = Object.values(TURN3_WORLD_ASSETS);

export type Turn3ActionId = 'gather' | 'build' | 'carry';

const actionFrame = (action: Turn3ActionId, frame: 1 | 2 | 3): Turn3Asset => ({
  textureKey: `turn3-action-${action}-${frame}`,
  filename: `${action}-${frame}.png`,
  width: 512,
  height: 512,
  groundAnchor: { x: 256, y: 480 },
  baseScale: 0.2,
  placementSpace: 'island',
  placement: action === 'gather'
    ? { x: 595, y: 625 }
    : action === 'build'
      ? { x: 475, y: 785 }
      : { x: 535, y: 835 },
  dir: TURN3_ACTION_ASSET_DIR,
  status: TURN3_ASSET_STATUS,
});

export const TURN3_ACTION_FRAMES = {
  gather: [actionFrame('gather', 1), actionFrame('gather', 2), actionFrame('gather', 3)],
  build: [actionFrame('build', 1), actionFrame('build', 2), actionFrame('build', 3)],
  carry: [actionFrame('carry', 1), actionFrame('carry', 2), actionFrame('carry', 3)],
} as const satisfies Record<Turn3ActionId, readonly Turn3Asset[]>;

export const TURN3_ACTION_ASSET_LIST: readonly Turn3Asset[] = Object.values(TURN3_ACTION_FRAMES).flat();

export const TURN3_ACTION_ANIMATIONS = {
  status: TURN3_ASSET_STATUS,
  frameSize: { width: 512, height: 512 },
  frameDurationMs: 180,
  cycleDurationMs: 540,
  repeat: true,
  origin: { x: 0.5, y: 480 / 512 },
  direction: 'right',
  rootMotion: false,
  animations: (Object.keys(TURN3_ACTION_FRAMES) as Turn3ActionId[]).map((id) => ({
    id,
    sequence: TURN3_ACTION_FRAMES[id].map((frame) => frame.filename),
    frameTextureKeys: TURN3_ACTION_FRAMES[id].map((frame) => frame.textureKey),
  })),
} as const;

export const TURN3_ASSET_LIST: readonly Turn3Asset[] = [
  ...TURN3_WORLD_ASSET_LIST,
  ...TURN3_ACTION_ASSET_LIST,
];
