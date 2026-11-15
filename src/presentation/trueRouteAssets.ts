import type { Point } from './layout';
import type { WorldAsset } from './worldAssets';

// Runtime art for Turn 3 (🪨), Turn 4 (💧) and the Epilogue, from the supplied
// true-route-materials-v3 candidate package. The package's human action PNGs are NOT
// registered: each bakes the human together with its tool or carried object, which
// breaks the human / object / effect layer boundary, so they stay in
// art-source/true-route/human-action-candidates/ (see crew.ts for the layered crew). EVERY file here is a PROVISIONAL
// candidate: it has not had human visual approval and must not be described as
// final art (see README "TRUE route assets"). The approved Turn 1/2 art is untouched.
//
// All PNGs are 512x512 RGBA. `groundAnchor` is the ground contact point in the PNG's
// own pixels: the horizontal centre of the opaque bounds and its bottom edge (the
// riverbeds and the spring use their stream ends instead, noted below), measured from
// the supplied files. Placement is chosen in layout.ts.

export const TRUE_ART_STATUS = 'provisional' as const;
export const TURN3_ASSET_DIR = '/assets/world/turn3/';
export const TURN4_ASSET_DIR = '/assets/world/turn4/';
export const TRUE_ART_SIZE = 512;

export type TrueAsset = Pick<WorldAsset, 'textureKey' | 'filename' | 'width' | 'height' | 'groundAnchor' | 'baseScale'> & {
  readonly dir: string;
};

const prop = (
  dir: string,
  textureKey: string,
  filename: string,
  groundAnchor: Point,
  baseScale: number,
): TrueAsset => ({ dir, textureKey, filename, width: TRUE_ART_SIZE, height: TRUE_ART_SIZE, groundAnchor, baseScale });

const centre = { x: 256, y: 479 } as const;

// Design pixels per PNG pixel. All are first-pass sizes chosen against the island at
// 360x640 and 390x844 and are a human play-review decision.
export const TRUE_PROPS = {
  matureFarm: prop(TURN3_ASSET_DIR, 'true-mature-farm', 'mature-farm.png', centre, 0.3),
  stoneWorkshop: prop(TURN3_ASSET_DIR, 'true-stone-workshop', 'stone-workshop.png', centre, 0.24),
  secondHut: prop(TURN3_ASSET_DIR, 'true-hut-second', 'hut-second.png', centre, 0.3),
  practicalCave: prop(TURN3_ASSET_DIR, 'true-cave-practical', 'cave-practical.png', centre, 0.2),
  fence: prop(TURN3_ASSET_DIR, 'true-fence', 'fence.png', centre, 0.36),
  feedTrough: prop(TURN3_ASSET_DIR, 'true-feed-trough', 'feed-trough.png', centre, 0.12),
  // The existing water-trough.png already holds blue water, so Turn 3 uses the empty
  // candidate and Turn 4 swaps to the filled one after the carry.
  basinEmpty: prop(TURN3_ASSET_DIR, 'true-basin-empty', 'water-trough-empty-candidate.png', centre, 0.13),
  basinFilled: prop(TURN3_ASSET_DIR, 'true-basin-filled', 'water-trough.png', centre, 0.13),
  livestockParent: prop(TURN3_ASSET_DIR, 'true-livestock-parent', 'livestock-parent.png', centre, 0.18),
  livestockChild: prop(TURN3_ASSET_DIR, 'true-livestock-child', 'livestock-child.png', centre, 0.12),
  // The riverbed is anchored at its mouth (the south-west end at the ocean). The dry
  // and flowing candidates share one footprint within 2 px (checked by a test).
  dryRiverbed: prop(TURN3_ASSET_DIR, 'true-riverbed-dry', 'dry-riverbed.png', { x: 171, y: 479 }, 0.55),
  flowingRiverbed: prop(TURN4_ASSET_DIR, 'true-riverbed-flowing', 'flowing-riverbed-candidate.png', { x: 172, y: 480 }, 0.55),
  // The pond is anchored at the end of its outlet stream, which is joined to the
  // riverbed's source end in layout.ts.
  springPond: prop(TURN4_ASSET_DIR, 'true-spring-pond', 'spring-pond-candidate.png', { x: 84, y: 466 }, 0.35),
  // Stage 4 cave furnishings (the practical-cave set plus a shrine); not a new cave.
  caveShrine: prop(TURN4_ASSET_DIR, 'true-cave-shrine', 'cave-shrine-candidate.png', { x: 256, y: 480 }, 0.2),
  // Feet bottoms differ from the livestock art (these carry leaves above the body), so
  // their anchors are their own foot lines.
  guardianParent: prop(TURN3_ASSET_DIR, 'true-guardian-parent', 'guardian-parent.png', { x: 256, y: 415 }, 0.18),
  guardianChild: prop(TURN3_ASSET_DIR, 'true-guardian-child', 'guardian-child.png', { x: 256, y: 450 }, 0.13),
} as const satisfies Record<string, TrueAsset>;

// The riverbed's source end in its own PNG pixels (where the spring's outlet joins).
export const RIVER_SOURCE_PX: Point = { x: 350, y: 46 };

export const TRUE_PROP_LIST: readonly TrueAsset[] = Object.values(TRUE_PROPS);
