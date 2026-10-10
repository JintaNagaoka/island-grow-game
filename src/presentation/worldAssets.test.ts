import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SliceGame } from '../game/sliceGame';
import { readPng, type PngImage } from '../testSupport/png';
import { computeFireVisual } from './animation';
import { DESIGN_WIDTH } from './display';
import { HUMAN_ASSET_LIST, HUMAN_WALK_ASSET_LIST } from './humanAssets';
import { LAYOUT } from './layout';
import {
  WORLD_ASSETS,
  WORLD_ASSET_DIR,
  WORLD_ASSET_LIST,
  WORLD_WATER_COLOR,
  type WorldAsset,
} from './worldAssets';

const WORLD_DIR = new URL('../../public/assets/world/initial-turn1/', import.meta.url);
const SCENE_SOURCE = readFileSync(new URL('./IslandScene.ts', import.meta.url), 'utf8');

const MAX_FILE_BYTES: Record<keyof typeof WORLD_ASSETS, number> = {
  island: 2_500_000,
  shelter: 250_000,
  animal: 250_000,
  fire: 150_000,
};

const loaded = new Map<string, { png: PngImage; bytes: number }>();
function load(asset: WorldAsset): { png: PngImage; bytes: number } {
  let entry = loaded.get(asset.filename);
  if (!entry) {
    const bytes = readFileSync(new URL(asset.filename, WORLD_DIR));
    entry = { png: readPng(bytes), bytes: bytes.length };
    loaded.set(asset.filename, entry);
  }
  return entry;
}

const alphaAt = (png: PngImage, x: number, y: number): number => png.pixels[(y * png.width + x) * 4 + 3];

function countVisibleGroups(png: PngImage): number {
  const seen = new Uint8Array(png.width * png.height);
  let groups = 0;
  for (let start = 0; start < seen.length; start += 1) {
    if (seen[start] || png.pixels[start * 4 + 3] === 0) continue;
    groups += 1;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      const x = index % png.width;
      const y = (index - x) / png.width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= png.width || ny >= png.height) continue;
          const n = ny * png.width + nx;
          if (seen[n] || png.pixels[n * 4 + 3] === 0) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
  }
  return groups;
}

describe('world asset metadata', () => {
  it('registers the four runtime PNGs with unique keys and filenames', () => {
    expect(Object.keys(WORLD_ASSETS)).toEqual(['island', 'shelter', 'animal', 'fire']);
    expect(WORLD_ASSET_LIST.map((asset) => asset.filename)).toEqual([
      'island-base.png',
      'shelter-stage1.png',
      'animal-stage1.png',
      'fire-stage1.png',
    ]);
    expect(WORLD_ASSET_DIR).toBe('/assets/world/initial-turn1/');
    const keys = [
      ...WORLD_ASSET_LIST.map((asset) => asset.textureKey),
      ...HUMAN_ASSET_LIST.map((asset) => asset.textureKey),
      ...HUMAN_WALK_ASSET_LIST.map((asset) => asset.textureKey),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('records the agreed base scale, ground anchor and placement of every asset', () => {
    expect(WORLD_ASSETS.island).toMatchObject({
      groundAnchor: { x: 470, y: 0 },
      baseScale: 0.68,
      placementSpace: 'design',
    });
    expect(WORLD_ASSETS.shelter).toMatchObject({
      groundAnchor: { x: 212, y: 296 },
      baseScale: 0.37,
      placementSpace: 'island',
      placement: { x: 190, y: 890 },
    });
    expect(WORLD_ASSETS.animal).toMatchObject({
      groundAnchor: { x: 290, y: 300 },
      baseScale: 0.17,
      placement: { x: 640, y: 690 },
    });
    expect(WORLD_ASSETS.fire).toMatchObject({
      groundAnchor: { x: 128, y: 246 },
      baseScale: 0.22,
      placement: { x: 590, y: 940 },
    });
  });

  it('sizes the shelter to about 80x50 logical px at the 360x640 reference', () => {
    const { width, height, baseScale } = WORLD_ASSETS.shelter;
    // Logical px at 360x640 are half the 720x1280 design px.
    expect((width * baseScale) / 2).toBeGreaterThan(72);
    expect((width * baseScale) / 2).toBeLessThan(88);
    expect((height * baseScale) / 2).toBeGreaterThan(48);
    expect((height * baseScale) / 2).toBeLessThan(62);
  });

  it('is a bright blue behind the transparent island margin', () => {
    const blue = WORLD_WATER_COLOR & 0xff;
    const red = (WORLD_WATER_COLOR >> 16) & 0xff;
    expect(blue).toBeGreaterThan(200);
    expect(blue - red).toBeGreaterThan(150);
  });
});

describe('runtime world PNGs', () => {
  for (const [name, asset] of Object.entries(WORLD_ASSETS)) {
    it(`${name}: is an 8-bit RGBA PNG of the registered size with transparent pixels`, () => {
      const { png, bytes } = load(asset);
      expect([png.bitDepth, png.colorType]).toEqual([8, 6]);
      expect([png.width, png.height]).toEqual([asset.width, asset.height]);
      expect(png.minAlpha).toBe(0);
      expect(png.maxAlpha).toBeGreaterThanOrEqual(250);
      expect(bytes).toBeLessThanOrEqual(MAX_FILE_BYTES[name as keyof typeof WORLD_ASSETS]);
    });

    it(`${name}: ground anchor lies inside the image on visible art`, () => {
      const { png } = load(asset);
      const { x, y } = asset.groundAnchor;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(asset.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(asset.height);
      let found = false;
      for (let dy = -10; dy <= 10 && !found; dy += 1) {
        for (let dx = -40; dx <= 40 && !found; dx += 1) {
          const px = Math.round(x) + dx;
          const py = Math.round(y) + dy;
          if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
          found = alphaAt(png, px, py) > 200;
        }
      }
      expect(found).toBe(true);
    });
  }

  it('removes the exterior checkerboard from the island and animal without leftovers', () => {
    for (const asset of [WORLD_ASSETS.island, WORLD_ASSETS.animal]) {
      const { png } = load(asset);
      // Corners are exterior background, so they must be transparent.
      for (const [cx, cy] of [
        [0, 0],
        [png.width - 1, 0],
        [0, png.height - 1],
        [png.width - 1, png.height - 1],
      ]) {
        expect(alphaAt(png, cx, cy)).toBe(0);
      }
      // One connected artwork: no detached checkerboard specks survive.
      expect(countVisibleGroups(png)).toBe(1);
      // Anti-aliased edges are kept as partial alpha, not hard-cut.
      let partial = 0;
      for (let i = 3; i < png.pixels.length; i += 4) {
        if (png.pixels[i] > 0 && png.pixels[i] < 255) partial += 1;
      }
      expect(partial).toBeGreaterThan(300);
    }
  });

  it('keeps the black outline of the animal opaque', () => {
    const { png } = load(WORLD_ASSETS.animal);
    let outline = 0;
    for (let i = 0; i < png.pixels.length; i += 4) {
      if (png.pixels[i + 3] === 255 && png.pixels[i] < 40 && png.pixels[i + 1] < 40 && png.pixels[i + 2] < 40) {
        outline += 1;
      }
    }
    expect(outline).toBeGreaterThan(3000);
  });
});

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

// Where a ground-anchored sprite lands on the design canvas.
function footprint(asset: WorldAsset, ground: { x: number; y: number }): Box {
  const left = ground.x - asset.groundAnchor.x * asset.baseScale;
  const top = ground.y - asset.groundAnchor.y * asset.baseScale;
  return {
    left,
    top,
    right: left + asset.width * asset.baseScale,
    bottom: top + asset.height * asset.baseScale,
  };
}

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// The human's drawn extent around a ground point: the 512px canvas at the
// shared sprite scale is far larger than the figure, so use a generous box.
const humanBox = (x: number, y: number): Box => ({ left: x - 16, right: x + 16, top: y - 56, bottom: y + 6 });

const SHELTER = footprint(WORLD_ASSETS.shelter, LAYOUT.shelter);
const FIRE = footprint(WORLD_ASSETS.fire, LAYOUT.fire);
const ANIMAL = footprint(WORLD_ASSETS.animal, LAYOUT.animal);
const ANIMAL_REACH: Box = {
  left: ANIMAL.left - 6,
  right: ANIMAL.right + 6,
  top: ANIMAL.top - 3,
  bottom: ANIMAL.bottom + 3,
};

function pathBoxes(from: { x: number; y: number }, to: { x: number; y: number }): Box[] {
  const steps = 40;
  return Array.from({ length: steps + 1 }, (_, i) =>
    humanBox(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps),
  );
}

describe('world layout', () => {
  it('fits the island in the world area above the UI panel, preserving aspect', () => {
    const island = WORLD_ASSETS.island;
    expect(LAYOUT.island.left).toBeGreaterThanOrEqual(0);
    expect(LAYOUT.island.right).toBeLessThanOrEqual(DESIGN_WIDTH);
    expect(LAYOUT.island.top).toBeGreaterThanOrEqual(0);
    expect(LAYOUT.island.bottom).toBeLessThanOrEqual(LAYOUT.ui.panelTop);
    // Uniform scale keeps the PNG's aspect ratio.
    const width = LAYOUT.island.right - LAYOUT.island.left;
    const height = LAYOUT.island.bottom - LAYOUT.island.top;
    expect(width / height).toBeCloseTo(island.width / island.height, 10);
    expect(LAYOUT.island.x).toBe(DESIGN_WIDTH / 2);
  });

  it('keeps every prop, the human and the fire above the UI safe boundary and on the island', () => {
    for (const box of [SHELTER, FIRE, ANIMAL_REACH]) {
      expect(box.bottom).toBeLessThan(LAYOUT.ui.panelTop);
      expect(box.top).toBeGreaterThan(LAYOUT.island.top);
      expect(box.left).toBeGreaterThan(LAYOUT.island.left);
      expect(box.right).toBeLessThan(LAYOUT.island.right);
    }
    for (const point of [LAYOUT.humanStart, LAYOUT.humanWarm, ...LAYOUT.humanWalkPreview]) {
      expect(point.y).toBeLessThan(LAYOUT.ui.panelTop);
      expect(point.x).toBeGreaterThan(LAYOUT.island.left);
      expect(point.x).toBeLessThan(LAYOUT.island.right);
    }
  });

  it('keeps the human walk from the shelter to the fire unobstructed', () => {
    for (const box of pathBoxes(LAYOUT.humanStart, LAYOUT.humanWarm)) {
      expect(overlaps(box, SHELTER)).toBe(false);
      expect(overlaps(box, FIRE)).toBe(false);
      expect(overlaps(box, ANIMAL_REACH)).toBe(false);
    }
    // The human starts beside the shelter and stops short of the fire.
    expect(LAYOUT.humanStart.x).toBeGreaterThan(SHELTER.right);
    expect(LAYOUT.humanWarm.x).toBeLessThan(FIRE.left);
  });

  it('keeps the dev walk-preview loop clear of the shelter, fire and animal', () => {
    const loop = LAYOUT.humanWalkPreview;
    loop.forEach((from, index) => {
      for (const box of pathBoxes(from, loop[(index + 1) % loop.length])) {
        expect(overlaps(box, SHELTER)).toBe(false);
        expect(overlaps(box, FIRE)).toBe(false);
        expect(overlaps(box, ANIMAL_REACH)).toBe(false);
      }
    });
  });

  it('retains growth space in the centre and front, clear of props and the path', () => {
    expect(LAYOUT.growthSpaces.map((space) => space.id)).toEqual(['central', 'front']);
    const walk = pathBoxes(LAYOUT.humanStart, LAYOUT.humanWarm);
    for (const space of LAYOUT.growthSpaces) {
      expect(space.bottom).toBeLessThan(LAYOUT.ui.panelTop);
      expect(space.right - space.left).toBeGreaterThan(80);
      expect(space.bottom - space.top).toBeGreaterThan(40);
      for (const box of [SHELTER, FIRE, ANIMAL_REACH, ...walk]) {
        expect(overlaps(space, box)).toBe(false);
      }
    }
  });

  it('places the animal on the island beside the baked tree, away from the cave', () => {
    // Exactly one animal: a single point, never a list.
    expect(Array.isArray(LAYOUT.animal)).toBe(false);
    expect(WORLD_ASSET_LIST.filter((asset) => asset.textureKey.includes('animal'))).toHaveLength(1);
    expect(LAYOUT.animal.y).toBeGreaterThan(LAYOUT.island.top + (LAYOUT.island.bottom - LAYOUT.island.top) * 0.3);
  });
});

describe('world presentation wiring', () => {
  it('keeps the fire hidden before it is chosen', () => {
    expect(computeFireVisual(new SliceGame().snapshot()).visible).toBe(false);
  });

  it('preloads every world asset from the registry and no checkerboard original', () => {
    expect(SCENE_SOURCE).toContain('for (const asset of WORLD_ASSET_LIST)');
    expect(SCENE_SOURCE).toContain('WORLD_ASSET_DIR');
    expect(SCENE_SOURCE).not.toMatch(/cave_reference|island_base_with_cave_tree|fantasy_creature_provisional/);
  });

  it('has dropped the duplicate legacy world Graphics', () => {
    for (const legacy of ['drawTerrainAndProps', 'createTree', 'createAnimal', 'createLivingScenery', 'sheep', 'deer', 'LAYOUT.terrain', 'LAYOUT.boulders']) {
      expect(SCENE_SOURCE).not.toContain(legacy);
    }
  });
});
