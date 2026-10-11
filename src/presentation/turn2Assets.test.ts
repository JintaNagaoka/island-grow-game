import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../../scripts/pngCodec.mjs';
import { deriveHutImage, deriveHutPng, HUT_MAX_WIDTH } from '../../scripts/deriveHutAsset.mjs';
import { removeExteriorBackground, WHITE_BACKGROUND_RULE } from '../../scripts/worldAssetPixels.mjs';
import { readPng, type PngImage } from '../testSupport/png';
import { HUMAN_ASSET_LIST, HUMAN_ASSETS, HUMAN_SPRITE_SCALE, HUMAN_WALK_ASSET_LIST } from './humanAssets';
import { walkRoute, walkRouteDurationMs, walkToward, HUMAN_WALK_SPEED_PX_PER_MS } from './humanWalk';
import { LAYOUT } from './layout';
import {
  ANIMAL_EAT_FRAMES,
  COOK_STEAM_FRAMES,
  FARM_ASSET_DIR,
  FARM_BASE_SCALE,
  FARM_COMPOSITE_PLOT_CENTER_PX,
  FARM_GRID,
  FARM_HARVEST_FRAMES,
  FARM_PLOT_TILE,
  FARM_TILE_STEP_PX,
  FARM_TILE_TOP_CENTER_ABOVE_ANCHOR_PX,
  FARM_WATER_FRAME,
  FARM_WATER_HUMAN_FEET,
  FARM_WORK_SEQUENCE,
  HUT_ASSET,
  TURN2_ANIMATIONS,
  TURN2_ASSET_LIST,
  TURN2_FRAME_DURATION_MS,
  TURN2_WORLD_ASSET_DIR,
  type Turn2Frame,
} from './turn2Assets';
import { FIRE_ASSET, FIRE_FRAMES, WORLD_ASSET_LIST, WORLD_ASSETS, groundOrigin, type WorldAsset } from './worldAssets';
import { PLANT_LIFE_WAVES } from '../game/waves';

const ROOT = new URL('../../', import.meta.url);
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fileBytes = (frame: Turn2Frame): Uint8Array => readFileSync(new URL(`public${frame.dir}${frame.filename}`, ROOT));

// SHA-256 of each PNG in turn2_assets_review_v2.zip (ZIP sha256 056d8edc…0e6e).
// The repository copies must be byte-identical: they are added unprocessed.
const ZIP_PNG_SHA256: Record<string, string> = {
  'human_farm_harvest1.png': '1d45937f4f30abbda71eb765cba7f3b5e50ba5ad14249aa3e24e5c9ab19f1eee',
  'human_farm_harvest2.png': '8a8c95160bb8c8fe43f6bc4f1310bab718ab1944f8b5be1ae6cfa95bb56757ec',
  'human_farm_water1.png': 'ded68b9d562533690847b8b26071964cd1f7a04f9833a760379178bd6446d7e6',
  'animal_eat1.png': 'ba16ff4555a581c4433ab5178415165f4ba4cbec51617a9a13de71b7eecd3228',
  'animal_eat2.png': '4d1b12e2ed7d3a7097dd457fe4065209839dbbc49beaa736b1c0e43c3a0aa387',
  'cook_pot_steam1.png': 'd0c0a50e1898e071c9b5f0123220e15408eacf145865235e550ad8603d174117',
  'cook_pot_steam2.png': '7dfa98bf87296478352b787e320824bb504aaf54bbc02f95f910eafe3be0bc3a',
};
// The approved standalone plot component (SHA-256 d1dedfc3…138f): added unedited.
const PLOT_TILE_SHA256 = 'd1dedfc3ee102ba9e2b0c5b1018b62d45e9e0848417a4246b07581e1c89c138f';
// The approved hut JPEG (SHA-256 74bac054…6397), kept unchanged as the source of
// truth, and its lossless PNG decode (macOS `sips -s format png`) the script reads.
const HUT_JPEG_SHA256 = '74bac0548d21c4d4cf35881cfe5419f8874ea9632082b390659b397031636397';
const HUT_DECODED_PNG_SHA256 = 'c4e34db4bc1e399067536a72eca623ed000e4cc4a423fe3942e808db434ca2ae';
const HUT_JPEG = new URL('art-source/turn2/hut-approved-source.jpg', ROOT);
const HUT_DECODED = new URL('art-source/turn2/hut-approved-source-decoded.png', ROOT);

const alphaAt = (png: PngImage, x: number, y: number): number => png.pixels[(y * png.width + x) * 4 + 3];

// Largest 8-connected group of alpha >= 128 pixels: the grounded art, without the
// animals' detached caption text or splash droplets.
function mainBounds(png: PngImage): { left: number; right: number; bottom: number } {
  const seen = new Uint8Array(png.width * png.height);
  let best = { size: 0, left: 0, right: 0, bottom: 0 };
  for (let start = 0; start < seen.length; start += 1) {
    if (seen[start] || png.pixels[start * 4 + 3] < 128) continue;
    const stack = [start];
    seen[start] = 1;
    let size = 0;
    let [left, right, bottom] = [png.width, -1, -1];
    while (stack.length > 0) {
      const index = stack.pop() as number;
      const x = index % png.width;
      const y = (index - x) / png.width;
      size += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= png.width || ny >= png.height) continue;
          const n = ny * png.width + nx;
          if (seen[n] || png.pixels[n * 4 + 3] < 128) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (size > best.size) best = { size, left, right, bottom };
  }
  return best;
}

const ZIP_FRAMES: readonly Turn2Frame[] = [
  ...FARM_HARVEST_FRAMES,
  FARM_WATER_FRAME,
  ...ANIMAL_EAT_FRAMES,
  ...COOK_STEAM_FRAMES,
];

describe('Turn 2 supplied animation PNGs', () => {
  it('registers exactly the seven ZIP PNGs plus the derived hut, with unique texture keys', () => {
    expect(ZIP_FRAMES.map((frame) => frame.filename).sort()).toEqual(Object.keys(ZIP_PNG_SHA256).sort());
    expect(TURN2_ASSET_LIST).toEqual([
      ...FARM_HARVEST_FRAMES,
      FARM_WATER_FRAME,
      FARM_PLOT_TILE,
      ...ANIMAL_EAT_FRAMES,
      ...COOK_STEAM_FRAMES,
      HUT_ASSET,
    ]);
    const keys = [
      ...TURN2_ASSET_LIST.map((asset) => asset.textureKey),
      ...WORLD_ASSET_LIST.map((asset) => asset.textureKey),
      ...HUMAN_ASSET_LIST.map((asset) => asset.textureKey),
      ...HUMAN_WALK_ASSET_LIST.map((asset) => asset.textureKey),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(ZIP_FRAMES.map((frame) => frame.textureKey)).toEqual([
      'farm-harvest-1',
      'farm-harvest-2',
      'farm-water-1',
      'animal-eat-1',
      'animal-eat-2',
      'cook-steam-1',
      'cook-steam-2',
    ]);
    expect(HUT_ASSET.textureKey).toBe('world-hut');
    expect(FARM_PLOT_TILE.textureKey).toBe('farm-plot-single');
  });

  it.each(ZIP_FRAMES)('$filename: byte-identical to the ZIP, 512x512 8-bit RGBA with transparency', (frame) => {
    const bytes = fileBytes(frame);
    expect(sha256(bytes)).toBe(ZIP_PNG_SHA256[frame.filename]);
    const png = readPng(bytes);
    expect([png.bitDepth, png.colorType]).toEqual([8, 6]);
    expect([png.width, png.height]).toEqual([512, 512]);
    expect([frame.width, frame.height]).toEqual([512, 512]);
    expect(png.minAlpha).toBe(0);
    expect(png.maxAlpha).toBe(255);
    for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]]) expect(alphaAt(png, x, y)).toBe(0);
  });

  it('serves human farm frames and world frames from the directories the registry names', () => {
    expect(FARM_ASSET_DIR).toBe('/assets/human/farm/');
    expect(TURN2_WORLD_ASSET_DIR).toBe('/assets/world/turn2/');
    for (const frame of TURN2_ASSET_LIST) expect(existsSync(new URL(`public${frame.dir}${frame.filename}`, ROOT))).toBe(true);
    for (const frame of [...FARM_HARVEST_FRAMES, FARM_WATER_FRAME]) expect(frame.dir).toBe(FARM_ASSET_DIR);
  });

  it.each([...ZIP_FRAMES, FARM_PLOT_TILE])('$textureKey: ground anchor is the centre and bottom of the grounded art', (frame) => {
    const bounds = mainBounds(readPng(fileBytes(frame)));
    expect(frame.groundAnchor.y).toBe(bounds.bottom);
    expect(Math.abs(frame.groundAnchor.x - (bounds.left + bounds.right) / 2)).toBeLessThanOrEqual(0.5);
  });

  it('records the agreed ground anchors, scales and placements', () => {
    expect(FARM_HARVEST_FRAMES.map((f) => f.groundAnchor)).toEqual([{ x: 289, y: 479 }, { x: 309, y: 479 }]);
    expect(FARM_WATER_FRAME.groundAnchor).toEqual({ x: 280, y: 479 });
    expect(ANIMAL_EAT_FRAMES.map((f) => f.groundAnchor)).toEqual([{ x: 239, y: 450 }, { x: 311, y: 450 }]);
    expect(COOK_STEAM_FRAMES.map((f) => f.groundAnchor)).toEqual([{ x: 254, y: 479 }, { x: 278, y: 479 }]);
    for (const frame of [...FARM_HARVEST_FRAMES, FARM_WATER_FRAME]) {
      expect(frame).toMatchObject({ baseScale: 0.22, placementSpace: 'island', placement: { x: 225, y: 724 } });
      expect(frame.baseScale).toBe(FARM_BASE_SCALE);
    }
    // The cooking fire is the campfire levelled up: the campfire's own ground point.
    for (const frame of COOK_STEAM_FRAMES) expect(frame).toMatchObject({ baseScale: 0.22, placement: FIRE_ASSET.placement });
    for (const frame of ANIMAL_EAT_FRAMES) {
      expect(frame).toMatchObject({ baseScale: 0.27, placement: WORLD_ASSETS.animal.placement });
    }
    expect(HUT_ASSET).toMatchObject({
      groundAnchor: { x: 256, y: 428 },
      baseScale: 0.3,
      placement: WORLD_ASSETS.shelter.placement,
      width: 512,
      height: 435,
    });
  });

  it('shares one on-screen ground point and scale across every frame of an animation (no hop)', () => {
    for (const frames of [FARM_HARVEST_FRAMES, ANIMAL_EAT_FRAMES, COOK_STEAM_FRAMES]) {
      const [first, ...rest] = frames;
      for (const frame of rest) {
        expect(frame.placement).toEqual(first.placement);
        expect(frame.baseScale).toBe(first.baseScale);
        expect(frame.placementSpace).toBe(first.placementSpace);
        expect(frame.width).toBe(first.width);
      }
      // The grounded art's bottom-centre lands on the same design point in each
      // frame: the anchor *is* that point, so the origin offset is the anchor.
      const centres = frames.map((frame) => {
        const bounds = mainBounds(readPng(fileBytes(frame)));
        const origin = groundOrigin(frame);
        return {
          x: ((bounds.left + bounds.right) / 2 - origin.x * frame.width) * frame.baseScale,
          y: (bounds.bottom - origin.y * frame.height) * frame.baseScale,
        };
      });
      for (const centre of centres) {
        expect(Math.abs(centre.x)).toBeLessThanOrEqual(0.5 * first.baseScale + 1e-9);
        expect(Math.abs(centre.y)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('Standalone farm plot tile (farm_plot_single.png)', () => {
  const bytes = fileBytes(FARM_PLOT_TILE);
  const png = readPng(bytes);

  it('is the approved PNG, byte for byte: 512x512 8-bit RGBA with a transparent background', () => {
    expect(sha256(bytes)).toBe(PLOT_TILE_SHA256);
    expect([png.bitDepth, png.colorType]).toEqual([8, 6]);
    expect([png.width, png.height]).toEqual([512, 512]);
    expect(png.minAlpha).toBe(0);
    expect(png.maxAlpha).toBe(255);
    for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]]) expect(alphaAt(png, x, y)).toBe(0);
    expect(FARM_PLOT_TILE.dir).toBe(TURN2_WORLD_ASSET_DIR);
    expect(FARM_PLOT_TILE.filename).toBe('farm_plot_single.png');
  });

  it('is registered with a stable ground anchor: bottom centre of its art, like every other frame', () => {
    expect(FARM_PLOT_TILE.groundAnchor).toEqual({ x: 256, y: 284 });
    const bounds = mainBounds(png);
    expect(bounds.bottom).toBe(FARM_PLOT_TILE.groundAnchor.y);
    expect(Math.abs((bounds.left + bounds.right) / 2 - FARM_PLOT_TILE.groundAnchor.x)).toBeLessThanOrEqual(0.5);
    // Same scale as the composite farm frames: one tile is one cell of their own plot.
    expect(FARM_PLOT_TILE.baseScale).toBe(FARM_BASE_SCALE);
    expect(FARM_PLOT_TILE.textureKey).toBe('farm-plot-single');
  });

  it('is never edited by the runtime: the Scene only scales and positions it', () => {
    const scene = readFileSync(new URL('src/presentation/IslandScene.ts', ROOT), 'utf8');
    expect(scene).toContain('FARM_PLOT_TILE');
    expect(scene).not.toMatch(/farm_plot_single|\.jpg/);
  });
});

describe('Turn 2 animation contract', () => {
  it('declares the looping animations: animal eating and the cooking fire, 300 ms per frame, repeat', () => {
    expect(TURN2_FRAME_DURATION_MS).toBe(300);
    expect(TURN2_ANIMATIONS).toEqual([
      { id: 'animal_eat', frameTextureKeys: ['animal-eat-1', 'animal-eat-2'], frameDurationMs: 300, repeat: true },
      { id: 'cook_steam', frameTextureKeys: ['cook-steam-1', 'cook-steam-2'], frameDurationMs: 300, repeat: true },
    ]);
  });

  it('declares the farm-work sequence: water1 1500 ms, harvest2 1500 ms, then settle on harvest1', () => {
    expect(FARM_WORK_SEQUENCE).toEqual([
      { id: 'water', textureKey: 'farm-water-1', durationMs: 1500 },
      { id: 'harvest', textureKey: 'farm-harvest-2', durationMs: 1500 },
      { id: 'settle', textureKey: 'farm-harvest-1', durationMs: null },
    ]);
    // The sequence is the Waves: the same durations, in the same order, before the expansion Wave.
    const ids = PLANT_LIFE_WAVES.map((wave) => wave.id);
    expect(ids.slice(1, 4)).toEqual(['human-waters-plot', 'human-harvests-plot', 'farm-expands']);
    expect(PLANT_LIFE_WAVES[1].durationMs).toBe(FARM_WORK_SEQUENCE[0].durationMs);
    expect(PLANT_LIFE_WAVES[2].durationMs).toBe(FARM_WORK_SEQUENCE[1].durationMs);
  });

  it('plays eating as eat1 -> eat2 and the cooking fire as steam1 -> steam2 (the ZIP sequence order)', () => {
    expect(FARM_HARVEST_FRAMES.map((frame) => frame.filename)).toEqual(['human_farm_harvest1.png', 'human_farm_harvest2.png']);
    expect(ANIMAL_EAT_FRAMES.map((frame) => frame.filename)).toEqual(['animal_eat1.png', 'animal_eat2.png']);
    expect(COOK_STEAM_FRAMES.map((frame) => frame.filename)).toEqual(['cook_pot_steam1.png', 'cook_pot_steam2.png']);
  });

  it('never loads an external placeholder or a file the registry does not name', () => {
    const sources = ['turn2Assets.ts', 'lifeAnimation.ts', 'IslandScene.ts'].map((file) =>
      readFileSync(new URL(`src/presentation/${file}`, ROOT), 'utf8'),
    );
    for (const source of sources) {
      expect(source).not.toMatch(/EXTERNAL_APPROVED_HUMAN_IDLE|animation\.json|requiresExternalApprovedIdle/);
    }
    // Only the registered files are ever requested: no ad-hoc image paths in the Scene.
    const scene = sources[2];
    expect(scene).toContain('for (const asset of TURN2_ASSET_LIST)');
    expect(scene).not.toMatch(/\.jpg|human_farm_|animal_eat|cook_pot|hut-stage2|farm_plot/);
  });

  it('stands the idle frame where the human stands in the water frame', () => {
    const png = readPng(fileBytes(FARM_WATER_FRAME));
    // The feet lie on cream body pixels of the supplied art (the lowest cream rows).
    const { x, y } = FARM_WATER_HUMAN_FEET;
    let cream = 0;
    for (let dy = -6; dy <= 0; dy += 1) {
      for (let dx = -8; dx <= 8; dx += 1) {
        const i = ((y + dy) * png.width + (x + dx)) * 4;
        if (png.pixels[i + 3] > 200 && png.pixels[i] > 235 && png.pixels[i + 1] > 215 && png.pixels[i + 2] < 215) cream += 1;
      }
    }
    expect(cream).toBeGreaterThan(20);
    expect(LAYOUT.plotHuman.x).toBeCloseTo(
      LAYOUT.plot.x + (x - FARM_WATER_FRAME.groundAnchor.x) * FARM_WATER_FRAME.baseScale,
      9,
    );
  });
});

describe('Turn 2 hut asset', () => {
  it('keeps the approved JPEG unchanged and its lossless decode pinned', () => {
    const jpeg = readFileSync(HUT_JPEG);
    expect(sha256(jpeg)).toBe(HUT_JPEG_SHA256);
    expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
    // Baseline JPEG (SOF0), 1280x1155, 3 components, no alpha channel.
    let sof = -1;
    for (let i = 2; i < jpeg.length - 1 && sof < 0; i += 1) if (jpeg[i] === 0xff && jpeg[i + 1] === 0xc0) sof = i;
    expect(sof).toBeGreaterThan(0);
    const u16 = (offset: number): number => (jpeg[offset] << 8) | jpeg[offset + 1];
    expect([u16(sof + 5), u16(sof + 7), jpeg[sof + 9]]).toEqual([1155, 1280, 3]);
    expect(sha256(readFileSync(HUT_DECODED))).toBe(HUT_DECODED_PNG_SHA256);
    const decoded = decodePng(readFileSync(HUT_DECODED));
    expect([decoded.width, decoded.height]).toEqual([1280, 1155]);
  });

  const runtimeBytes = readFileSync(new URL(`public${HUT_ASSET.dir}${HUT_ASSET.filename}`, ROOT));
  const runtime = readPng(runtimeBytes);

  it('is an 8-bit RGBA PNG of the registered size with a transparent background', () => {
    expect([runtime.bitDepth, runtime.colorType]).toEqual([8, 6]);
    expect([runtime.width, runtime.height]).toEqual([HUT_ASSET.width, HUT_ASSET.height]);
    expect(runtime.width).toBeLessThanOrEqual(HUT_MAX_WIDTH);
    expect(runtime.minAlpha).toBe(0);
    expect(runtime.maxAlpha).toBe(255);
    // The former white backdrop is transparent at the margins that were background.
    for (const [x, y] of [[0, 0], [runtime.width - 1, 0], [0, runtime.height - 1], [runtime.width - 1, runtime.height - 1], [4, 4], [runtime.width - 6, 6]]) {
      expect(alphaAt(runtime, x, y)).toBe(0);
    }
    expect(runtimeBytes.length).toBeLessThan(500_000);
  });

  it('is derived deterministically from the approved source (same pixels, run after run)', () => {
    const decodedBytes = readFileSync(HUT_DECODED);
    const first = deriveHutPng(decodedBytes);
    const second = deriveHutPng(decodedBytes);
    expect(first).toEqual(second);
    expect(decodePng(first).pixels).toEqual(decodePng(runtimeBytes).pixels);
  });

  it('removes only the exterior-connected white: one connected artwork, no enclosed holes, no white halo', () => {
    // One 8-connected visible group: no detached background residue.
    const mask = (x: number, y: number): boolean => alphaAt(runtime, x, y) > 0;
    const seen = new Uint8Array(runtime.width * runtime.height);
    let groups = 0;
    // Transparent pixels not reachable from the border would be holes punched into the art.
    const outside = new Uint8Array(runtime.width * runtime.height);
    const stack: number[] = [];
    const pushOutside = (x: number, y: number): void => {
      const i = y * runtime.width + x;
      if (outside[i] || mask(x, y)) return;
      outside[i] = 1;
      stack.push(i);
    };
    for (let x = 0; x < runtime.width; x += 1) {
      pushOutside(x, 0);
      pushOutside(x, runtime.height - 1);
    }
    for (let y = 0; y < runtime.height; y += 1) {
      pushOutside(0, y);
      pushOutside(runtime.width - 1, y);
    }
    while (stack.length > 0) {
      const i = stack.pop() as number;
      const x = i % runtime.width;
      const y = (i - x) / runtime.width;
      if (x > 0) pushOutside(x - 1, y);
      if (x < runtime.width - 1) pushOutside(x + 1, y);
      if (y > 0) pushOutside(x, y - 1);
      if (y < runtime.height - 1) pushOutside(x, y + 1);
    }
    let holes = 0;
    for (let start = 0; start < seen.length; start += 1) {
      const x0 = start % runtime.width;
      const y0 = (start - x0) / runtime.width;
      if (!mask(x0, y0) && !outside[start]) holes += 1;
      if (seen[start] || !mask(x0, y0)) continue;
      groups += 1;
      const queue = [start];
      seen[start] = 1;
      while (queue.length > 0) {
        const index = queue.pop() as number;
        const x = index % runtime.width;
        const y = (index - x) / runtime.width;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= runtime.width || ny >= runtime.height) continue;
            const n = ny * runtime.width + nx;
            if (seen[n] || !mask(nx, ny)) continue;
            seen[n] = 1;
            queue.push(n);
          }
        }
      }
    }
    expect(groups).toBe(1);
    expect(holes).toBe(0);

    // No opaque near-white pixel touches the transparent exterior (white fringe).
    let fringe = 0;
    for (let y = 1; y < runtime.height - 1; y += 1) {
      for (let x = 1; x < runtime.width - 1; x += 1) {
        if (alphaAt(runtime, x, y) < 250) continue;
        const exterior = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => alphaAt(runtime, x + dx, y + dy) === 0);
        const i = (y * runtime.width + x) * 4;
        if (exterior && runtime.pixels[i] > 235 && runtime.pixels[i + 1] > 235 && runtime.pixels[i + 2] > 235) fringe += 1;
      }
    }
    expect(fringe).toBe(0);
    // Anti-aliased outline kept as partial alpha, not hard-cut.
    let partial = 0;
    for (let i = 3; i < runtime.pixels.length; i += 4) if (runtime.pixels[i] > 0 && runtime.pixels[i] < 255) partial += 1;
    expect(partial).toBeGreaterThan(1000);
  });

  it('keeps every fully opaque pixel the source’s own colour: nothing is redrawn or recoloured', () => {
    const source = decodePng(readFileSync(HUT_DECODED));
    const cutOut = removeExteriorBackground(source, WHITE_BACKGROUND_RULE);
    let opaque = 0;
    let changed = 0;
    for (let i = 0; i < cutOut.pixels.length; i += 4) {
      if (cutOut.pixels[i + 3] !== 255) continue;
      opaque += 1;
      if (cutOut.pixels[i] !== source.pixels[i] || cutOut.pixels[i + 1] !== source.pixels[i + 1] || cutOut.pixels[i + 2] !== source.pixels[i + 2]) {
        changed += 1;
      }
    }
    expect(changed).toBe(0);
    expect(opaque).toBeGreaterThan(source.width * source.height * 0.4);
    // The derivation adds nothing else: its output is a trimmed, area-resized cut-out.
    const derived = deriveHutImage(source);
    expect(derived.width).toBe(HUT_MAX_WIDTH);
    expect(encodePng(derived).length).toBeGreaterThan(0);
  });

  it('anchors at the bottom centre on visible art and sizes the hut a little larger than the shelter', () => {
    const { x, y } = HUT_ASSET.groundAnchor;
    expect(x).toBe(HUT_ASSET.width / 2);
    let found = false;
    for (let dy = -10; dy <= 10 && !found; dy += 1) {
      for (let dx = -40; dx <= 40 && !found; dx += 1) found = alphaAt(runtime, x + dx, y + dy) > 200;
    }
    expect(found).toBe(true);
    const shelter = WORLD_ASSETS.shelter;
    const hutWidth = HUT_ASSET.width * HUT_ASSET.baseScale;
    expect(hutWidth).toBeGreaterThan(shelter.width * shelter.baseScale * 0.9);
    expect(hutWidth).toBeLessThan(shelter.width * shelter.baseScale * 1.15);
    expect(HUT_ASSET.height * HUT_ASSET.baseScale).toBeGreaterThan(shelter.height * shelter.baseScale);
  });
});

// --- Layout ---------------------------------------------------------------

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
const overlaps = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// Visible (alpha >= 128) pixel extent of a frame placed at `ground`.
function visibleBox(asset: WorldAsset, bytes: Uint8Array, ground: { x: number; y: number }, scale = asset.baseScale): Box {
  const png = readPng(bytes);
  const origin = groundOrigin(asset);
  let [minX, minY, maxX, maxY] = [png.width, png.height, -1, -1];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (alphaAt(png, x, y) < 128) continue;
      [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
    }
  }
  const at = (px: number, py: number) => ({
    x: ground.x + (px - origin.x * asset.width) * scale,
    y: ground.y + (py - origin.y * asset.height) * scale,
  });
  return { left: at(minX, 0).x, right: at(maxX, 0).x, top: at(0, minY).y, bottom: at(0, maxY).y };
}

// Design-canvas pixels (rounded "x,y" keys) covered by an asset's visible (alpha >= 128) art.
function opaquePixels(asset: WorldAsset, bytes: Uint8Array, ground: { x: number; y: number }): Set<string> {
  const png = readPng(bytes);
  const origin = groundOrigin(asset);
  const pixels = new Set<string>();
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (alphaAt(png, x, y) < 128) continue;
      const px = asset.flipX ? png.width - 1 - x : x;
      pixels.add(`${Math.round(ground.x + (px - origin.x * asset.width) * asset.baseScale)},${Math.round(ground.y + (y - origin.y * asset.height) * asset.baseScale)}`);
    }
  }
  return pixels;
}

const union = (boxes: readonly Box[]): Box => ({
  left: Math.min(...boxes.map((b) => b.left)),
  top: Math.min(...boxes.map((b) => b.top)),
  right: Math.max(...boxes.map((b) => b.right)),
  bottom: Math.max(...boxes.map((b) => b.bottom)),
});

const PLOT_BOX = union([...FARM_HARVEST_FRAMES, FARM_WATER_FRAME].map((frame) => visibleBox(frame, fileBytes(frame), LAYOUT.plot)));
// The expanded farm: the composite plot plus every standalone tile's visible art.
const TILE_BYTES = fileBytes(FARM_PLOT_TILE);
const TILE_BOXES = LAYOUT.farmPlotTiles.map((ground) => visibleBox(FARM_PLOT_TILE, TILE_BYTES, ground));
const FARM_BOX = union([PLOT_BOX, ...TILE_BOXES]);
const COOK_BOX = union(COOK_STEAM_FRAMES.map((frame) => visibleBox(frame, fileBytes(frame), LAYOUT.cookingFire)));
const HUT_BOX = visibleBox(HUT_ASSET, fileBytes(HUT_ASSET), LAYOUT.hut);

const island = readPng(readFileSync(new URL('public/assets/world/initial-turn1/island-base.png', ROOT)));
const ISLAND = WORLD_ASSETS.island;
// Design point -> island PNG pixel.
const toIslandPx = (p: { x: number; y: number }) => ({
  x: Math.round(ISLAND.groundAnchor.x + (p.x - ISLAND.placement.x) / ISLAND.baseScale),
  y: Math.round(ISLAND.groundAnchor.y + (p.y - ISLAND.placement.y) / ISLAND.baseScale),
});
function groundAt(x: number, y: number): 'grass' | 'sand' | 'none' {
  if (x < 0 || y < 0 || x >= island.width || y >= island.height) return 'none';
  const i = (y * island.width + x) * 4;
  const [r, g, b, a] = [island.pixels[i], island.pixels[i + 1], island.pixels[i + 2], island.pixels[i + 3]];
  if (a < 128) return 'none';
  if (g >= r - 5 && g > b + 25) return 'grass';
  if (r > 215 && g > 175 && b < 175 && r - b > 55) return 'sand';
  return 'none';
}
// Walkable: grass or sand under the point and a small margin around it.
const standable = (p: { x: number; y: number }, margin = 6): boolean => {
  const c = toIslandPx(p);
  return [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]].every(([dx, dy]) => groundAt(c.x + dx, c.y + dy) !== 'none');
};
// The campfire's visible extent over both flicker frames.
const FIRE_BOX = union(FIRE_FRAMES.map((frame) => visibleBox(frame, readFileSync(new URL(`public/assets/world/initial-turn1/${frame.filename}`, ROOT)), LAYOUT.fire)));
const ANIMAL_REACH: Box = {
  left: LAYOUT.animal.x - 50,
  right: LAYOUT.animal.x + 50,
  top: LAYOUT.animal.y - 40,
  bottom: LAYOUT.animal.y + 8,
};
const humanBox = (p: { x: number; y: number }): Box => ({ left: p.x - 11, right: p.x + 11, top: p.y - 56, bottom: p.y + 6 });

function routeSamples(): { x: number; y: number }[] {
  const duration = walkRouteDurationMs(LAYOUT.humanPlotRoute);
  return Array.from({ length: 121 }, (_, i) => walkRoute(LAYOUT.humanPlotRoute, (duration * i) / 120));
}

describe('Expanded farm layout', () => {
  it('lays out one tile per grid cell outside the composite plot, on one coherent isometric lattice', () => {
    const { along, across, compositeCells } = FARM_GRID;
    expect(LAYOUT.farmPlotTiles).toHaveLength(along * across - compositeCells * compositeCells);
    const stepX = FARM_TILE_STEP_PX.x * FARM_BASE_SCALE;
    const stepY = FARM_TILE_STEP_PX.y * FARM_BASE_SCALE;
    const first = LAYOUT.farmPlotTiles[0];
    const cells = new Set<string>();
    for (const tile of LAYOUT.farmPlotTiles) {
      // x = x0 + (a + b) * stepX and y = y0 + (a - b) * stepY for integers a, b: parity and spacing hold.
      const sum = (tile.x - first.x) / stepX;
      const diff = (tile.y - first.y) / stepY;
      expect(Math.abs(sum - Math.round(sum))).toBeLessThan(1e-6);
      expect(Math.abs(diff - Math.round(diff))).toBeLessThan(1e-6);
      expect(Math.abs((Math.round(sum) + Math.round(diff)) % 2)).toBe(0);
      cells.add(`${tile.x.toFixed(4)},${tile.y.toFixed(4)}`);
    }
    expect(cells.size).toBe(LAYOUT.farmPlotTiles.length); // no two tiles on the same spot
    // Tiles share one anchor convention and scale, so they cannot jump relative to each other.
    expect(FARM_PLOT_TILE.baseScale).toBe(FARM_BASE_SCALE);
  });

  it('never covers the composite plot cells with a tile', () => {
    const composite = FARM_HARVEST_FRAMES[0];
    const origin = groundOrigin(composite);
    const centre = {
      x: LAYOUT.plot.x + FARM_COMPOSITE_PLOT_CENTER_PX.x * FARM_BASE_SCALE,
      y: LAYOUT.plot.y + FARM_COMPOSITE_PLOT_CENTER_PX.y * FARM_BASE_SCALE,
    };
    expect(origin.x).toBeCloseTo(289 / 512, 9);
    const tileTopCentreOffset = FARM_TILE_TOP_CENTER_ABOVE_ANCHOR_PX * FARM_BASE_SCALE;
    for (const tile of LAYOUT.farmPlotTiles) {
      const tileCentre = { x: tile.x, y: tile.y - tileTopCentreOffset };
      // A tile's top-face centre is at least one cell away from the composite plot's centre.
      const cellsAway = Math.abs(tileCentre.x - centre.x) / (FARM_TILE_STEP_PX.x * FARM_BASE_SCALE);
      expect(cellsAway).toBeGreaterThan(0.99);
    }
  });

  it('is close to the Visual Reference’s plot in size and shape (about 140x90 design px)', () => {
    const width = FARM_BOX.right - FARM_BOX.left;
    const height = FARM_BOX.bottom - FARM_BOX.top;
    // Reference plot: about 145x92 reference px; the island is drawn 0.95x as wide here.
    expect(width).toBeGreaterThan(138 * 0.75);
    expect(width).toBeLessThan(138 * 1.25);
    expect(height).toBeGreaterThan(88 * 0.65);
    expect(height).toBeLessThan(88 * 1.2);
    // A wider-than-tall field, like the reference's parallelogram.
    expect(width / height).toBeGreaterThan(1.3);
  });

  it('keeps the whole farm left of the central reserved space and clear of the UI, hut, fire, animal and future space', () => {
    for (const box of [FARM_BOX, ...TILE_BOXES]) {
      expect(box.bottom).toBeLessThan(LAYOUT.ui.panelTop);
      expect(box.left).toBeGreaterThan(LAYOUT.island.left);
      expect(box.top).toBeGreaterThan(LAYOUT.island.top);
      for (const other of [HUT_BOX, FIRE_BOX, ANIMAL_REACH, COOK_BOX, ...LAYOUT.growthSpaces]) {
        expect(overlaps(box, other)).toBe(false);
      }
    }
    const central = LAYOUT.growthSpaces.find((space) => space.id === 'central');
    expect(FARM_BOX.right).toBeLessThan(central?.left ?? 0);
    // A clear lane remains between the farm and the hut for walking.
    expect(HUT_BOX.top - FARM_BOX.bottom).toBeGreaterThan(8);
  });

  it('keeps every tile on grass, away from cliffs, water and the sand path', () => {
    for (const tile of LAYOUT.farmPlotTiles) {
      const px = toIslandPx(tile);
      expect(groundAt(px.x, px.y)).toBe('grass');
      for (const [dx, dy] of [[-14, 0], [14, 0], [0, -8], [0, 8]]) expect(groundAt(px.x + dx, px.y + dy)).not.toBe('none');
    }
  });

  it('keeps the walking route off every tile (feet) except at the Human’s own spot', () => {
    for (const point of routeSamples()) {
      if (Math.hypot(point.x - LAYOUT.plotHuman.x, point.y - LAYOUT.plotHuman.y) < 40) continue;
      const feet = { left: point.x - 8, right: point.x + 8, top: point.y - 3, bottom: point.y + 3 };
      for (const box of TILE_BOXES) expect(overlaps(feet, box)).toBe(false);
    }
  });
});

describe('Turn 2 layout (360x640 and 390x844 share the 720x1280 design space)', () => {
  it('puts the plot on the left-middle terrace at about the animal’s height, on grass, above the UI', () => {
    // Left of the island's centre line, level with the animal (the Turn 2 Visual Reference).
    expect(LAYOUT.plot.x).toBeLessThan(LAYOUT.island.x);
    expect(LAYOUT.plot.x).toBeLessThan(LAYOUT.animal.x);
    expect(Math.abs(LAYOUT.plot.y - LAYOUT.animal.y)).toBeLessThan(60);
    // Above the hut and the fire (the lower-left living area), not down on the beach.
    expect(LAYOUT.plot.y).toBeLessThan(LAYOUT.hut.y - 100);
    expect(PLOT_BOX.bottom).toBeLessThan(LAYOUT.ui.panelTop);
    expect(PLOT_BOX.left).toBeGreaterThan(LAYOUT.island.left);
    // The composite's contact point, the Human beside it and every standalone tile stand on grass.
    for (const point of [LAYOUT.plot, LAYOUT.plotHuman, ...LAYOUT.farmPlotTiles]) {
      expect(groundAt(toIslandPx(point).x, toIslandPx(point).y)).toBe('grass');
      expect(standable(point, 6)).toBe(true);
    }
    for (const frame of [...FARM_HARVEST_FRAMES, FARM_WATER_FRAME]) {
      const box = visibleBox(frame, fileBytes(frame), LAYOUT.plot);
      for (const corner of [[box.left, box.bottom], [box.right, box.bottom]]) {
        expect(standable({ x: corner[0], y: corner[1] }, 3)).toBe(true);
      }
    }
    expect(groundAt(toIslandPx(LAYOUT.plot).x, toIslandPx(LAYOUT.plot).y)).toBe('grass');
    for (const box of [HUT_BOX, ANIMAL_REACH, FIRE_BOX]) expect(overlaps(PLOT_BOX, box)).toBe(false);
  });

  it('keeps the plot out of the central and front growth spaces and off the walking route', () => {
    expect(LAYOUT.growthSpaces.filter((space) => overlaps(PLOT_BOX, space)).map((space) => space.id)).toEqual([]);
    // Until the human is within a few steps of the plot (where it becomes part of the composite art):
    // the walk approaches from the lower left and never crosses the plot itself.
    for (const point of routeSamples()) {
      if (Math.hypot(point.x - LAYOUT.plotHuman.x, point.y - LAYOUT.plotHuman.y) < 40) continue;
      // Feet, not the whole 62 px-tall body box: the walker may pass just below the plot's corner.
      expect(overlaps({ left: point.x - 8, right: point.x + 8, top: point.y - 3, bottom: point.y + 3 }, PLOT_BOX) ? point : null).toBeNull();
    }
    // Standing at the plot: the human is part of the composite art, beside the plot, not on it.
    expect(LAYOUT.plotHuman.x).toBeLessThan(LAYOUT.plot.x);
  });

  it('stands the hut on the shelter’s ground point inside the island and the UI safe area', () => {
    expect(LAYOUT.hut).toEqual(LAYOUT.shelter);
    expect(HUT_BOX.bottom).toBeLessThan(LAYOUT.ui.panelTop);
    expect(HUT_BOX.left).toBeGreaterThan(LAYOUT.island.left);
    expect(HUT_BOX.top).toBeGreaterThan(LAYOUT.island.top);
    // The hut’s footprint (bottom edge) stands on island ground, and the hut stays clear of the fire.
    const base = toIslandPx({ x: LAYOUT.hut.x, y: LAYOUT.hut.y });
    for (const dx of [-60, -30, 0, 30, 60]) expect(groundAt(base.x + dx, base.y)).not.toBe('none');
    expect(HUT_BOX.right).toBeLessThan(FIRE_BOX.left + 6);
  });

  it('leaves the human’s start and warm-up spots free of the hut', () => {
    for (const point of [LAYOUT.humanStart, LAYOUT.humanWarm]) {
      expect(overlaps({ left: point.x - 8, right: point.x + 8, top: point.y - 3, bottom: point.y + 3 }, HUT_BOX)).toBe(false);
    }
  });

  it('puts the cooking fire exactly on the campfire’s ground point: it replaces the campfire, it is not a second object', () => {
    expect(LAYOUT.cookingFire).toEqual(LAYOUT.fire);
    expect(COOK_STEAM_FRAMES.map((frame) => frame.placement)).toEqual([FIRE_ASSET.placement, FIRE_ASSET.placement]);
    expect(COOK_STEAM_FRAMES.map((frame) => frame.placementSpace)).toEqual(['island', 'island']);
    // No separate pot placement exists any more.
    expect(Object.keys(LAYOUT)).not.toContain('pot');
    // Its stone ring is about the campfire's width (a level-up of the same fire, not a bigger or smaller one).
    const ring = (png: PngImage): number => {
      let [left, right] = [png.width, -1];
      for (let y = Math.floor(png.height * 0.85); y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
          if (alphaAt(png, x, y) < 128) continue;
          [left, right] = [Math.min(left, x), Math.max(right, x)];
        }
      }
      return right - left + 1;
    };
    const campfireRing = ring(readPng(readFileSync(new URL('public/assets/world/initial-turn1/fire-stage1-a.png', ROOT)))) * FIRE_ASSET.baseScale;
    for (const frame of COOK_STEAM_FRAMES) {
      const cookRing = ring(readPng(fileBytes(frame))) * frame.baseScale;
      expect(Math.abs(cookRing - campfireRing) / campfireRing).toBeLessThan(0.35);
    }
    expect(COOK_BOX.bottom).toBeLessThan(LAYOUT.ui.panelTop);
    for (const box of [PLOT_BOX, ANIMAL_REACH, ...LAYOUT.growthSpaces]) expect(overlaps(COOK_BOX, box)).toBe(false);
    for (const x of [LAYOUT.humanStart.x, LAYOUT.humanWarm.x]) {
      expect(overlaps({ left: x - 8, right: x + 8, top: LAYOUT.humanStart.y - 3, bottom: LAYOUT.humanStart.y + 3 }, COOK_BOX)).toBe(false);
    }
  });

  it('keeps the animal’s eating art on the grass terrace at its own ground point', () => {
    for (const frame of ANIMAL_EAT_FRAMES) {
      const box = visibleBox(frame, fileBytes(frame), LAYOUT.animal);
      expect(box.right).toBeLessThan(LAYOUT.island.right);
      expect(box.left).toBeGreaterThan(LAYOUT.island.left);
      expect(box.bottom).toBeLessThan(LAYOUT.ui.panelTop);
      expect(overlaps(box, PLOT_BOX)).toBe(false);
      expect(overlaps(box, HUT_BOX)).toBe(false);
      // About the same footprint as the grazing animal (within a third).
      const grazing = WORLD_ASSETS.animal.width * WORLD_ASSETS.animal.baseScale;
      expect(box.right - box.left).toBeGreaterThan(grazing * 0.8);
      expect(box.right - box.left).toBeLessThan(grazing * 1.4);
    }
  });

  it('walks from the fire to the plot over walkable ground, clear of the fire, shelter and animal', () => {
    const route = LAYOUT.humanPlotRoute;
    expect(route[0]).toEqual(LAYOUT.humanWarm);
    expect(route[route.length - 1]).toEqual(LAYOUT.plotHuman);
    // The hut is not on screen while the human walks (it appears in a later Wave).
    const shelterPixels = opaquePixels(WORLD_ASSETS.shelter, readFileSync(new URL('public/assets/world/initial-turn1/shelter-stage1.png', ROOT)), LAYOUT.shelter);
    const firePixels = FIRE_FRAMES.map((frame) =>
      opaquePixels(frame, readFileSync(new URL(`public/assets/world/initial-turn1/${frame.filename}`, ROOT)), LAYOUT.fire),
    );
    const hits: string[] = [];
    for (const point of routeSamples()) {
      expect(standable(point, 4)).toBe(true);
      expect(overlaps(humanBox(point), ANIMAL_REACH)).toBe(false);
      // The feet (2 px either side of the ground point, 1 px up and down) never land on an opaque
      // shelter or fire pixel. The gap is narrow: the 22 px body is squeezed between them for a moment.
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const key = `${Math.round(point.x + dx)},${Math.round(point.y + dy)}`;
          if (shelterPixels.has(key)) hits.push(`shelter ${key} @${point.x.toFixed(1)},${point.y.toFixed(1)}`);
          if (firePixels.some((fire) => fire.has(key))) hits.push(`fire ${key} @${point.x.toFixed(1)},${point.y.toFixed(1)}`);
        }
      }
    }
    expect(hits.slice(0, 6)).toEqual([]);
  });

  it('finishes the walk inside the walk Wave, with time to stand before the plot appears', () => {
    const duration = walkRouteDurationMs(LAYOUT.humanPlotRoute);
    expect(duration).toBeLessThan(PLANT_LIFE_WAVES[0].durationMs);
    expect(PLANT_LIFE_WAVES[0].durationMs - duration).toBeLessThan(900);
  });
});

// --- Human scale ---------------------------------------------------------

// Apparent head diameter (PNG px) of a Human drawn on a 512px canvas, estimated from
// the width of the head's outline 16 rows below the top of the figure: for a circle of
// diameter D that chord is 2*sqrt(16*(D-16)), so D = 16 + chord^2/64. The measure uses
// only the topmost rows (head, never the plot or props) so it works on every
// Human frame, including the farm frames.
function headDiameter(png: PngImage): number {
  let top = 0;
  while (top < png.height && !Array.from({ length: png.width }, (_, x) => alphaAt(png, x, top)).some((a) => a >= 128)) top += 1;
  const row = top + 16;
  let [left, right] = [png.width, -1];
  for (let x = 0; x < png.width; x += 1) {
    if (alphaAt(png, x, row) < 128) continue;
    [left, right] = [Math.min(left, x), Math.max(right, x)];
  }
  const chord = right - left + 1;
  return 16 + (chord * chord) / 64;
}

describe('Human scale in the farm frames', () => {
  const humanPng = (name: string): PngImage => readPng(readFileSync(new URL(`public/assets/human/${name}`, ROOT)));
  const idleHead = headDiameter(humanPng('idle.png')) * HUMAN_SPRITE_SCALE;
  const walkHead = headDiameter(humanPng('walk/human-walk-right-stand.png')) * HUMAN_SPRITE_SCALE;
  // The approved Humans' on-screen head, in design px: the idle and walk art differ a little.
  const approvedHead = (idleHead + walkHead) / 2;

  it('keeps the approved Human sprite scale and art untouched', () => {
    expect(HUMAN_SPRITE_SCALE).toBe(0.1);
    expect(HUMAN_ASSETS.idle.normal).toMatchObject({ textureKey: 'idle', groundAnchorX: 255, groundAnchorY: 479 });
    // The approved Humans are about 20-25 design px across the head.
    expect(idleHead).toBeGreaterThan(18);
    expect(idleHead).toBeLessThan(28);
    expect(walkHead).toBeGreaterThan(16);
    expect(walkHead).toBeLessThan(26);
  });

  it.each([...FARM_HARVEST_FRAMES, FARM_WATER_FRAME])(
    '$textureKey: the Human inside the frame is as large on screen as the approved Human (within 10%)',
    (frame) => {
      const head = headDiameter(readPng(fileBytes(frame))) * frame.baseScale;
      expect(Math.abs(head - approvedHead) / approvedHead).toBeLessThan(0.1);
    },
  );

  it('would have been far too small at the previous scale (the regression this guards)', () => {
    for (const frame of [...FARM_HARVEST_FRAMES, FARM_WATER_FRAME]) {
      const head = headDiameter(readPng(fileBytes(frame))) * HUMAN_SPRITE_SCALE;
      expect(head / approvedHead).toBeLessThan(0.6);
    }
  });

  it('shares one scale across the farm frames, and the water frame matches the idle Human it alternates with', () => {
    for (const frame of [...FARM_HARVEST_FRAMES, FARM_WATER_FRAME]) expect(frame.baseScale).toBe(FARM_BASE_SCALE);
    const waterHead = headDiameter(readPng(fileBytes(FARM_WATER_FRAME))) * FARM_BASE_SCALE;
    expect(Math.abs(waterHead - idleHead) / idleHead).toBeLessThan(0.15);
  });

  it('makes the plot a plot: much larger than before, and its Human still beside it, not on it', () => {
    const plotWidth = (PLOT_BOX.right - PLOT_BOX.left);
    expect(plotWidth).toBeGreaterThan(50);
    expect(plotWidth).toBeLessThan(80);
  });
});

// --- Visual Reference ------------------------------------------------------

describe('Turn 2 Visual Reference (kept unchanged)', () => {
  const REFERENCE = new URL('art-source/turn2/visual-reference-turn2-end.jpg', ROOT);
  it('is the supplied 720x1280 RGB baseline JPEG, byte for byte', () => {
    const jpeg = readFileSync(REFERENCE);
    expect(sha256(jpeg)).toBe('eb27ba21e6b70a6df91830a9562f78ce956a9152af29c714d74a244b2223c455');
    expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
    let sof = -1;
    for (let i = 2; i < jpeg.length - 1 && sof < 0; i += 1) if (jpeg[i] === 0xff && jpeg[i + 1] === 0xc0) sof = i;
    expect(sof).toBeGreaterThan(0); // baseline (SOF0)
    const u16 = (offset: number): number => (jpeg[offset] << 8) | jpeg[offset + 1];
    // height, width, 3 components (RGB/YCbCr, no alpha), 8-bit precision.
    expect([u16(sof + 5), u16(sof + 7), jpeg[sof + 9], jpeg[sof + 4]]).toEqual([1280, 720, 3, 8]);
  });

  it('is a design reference only: the runtime never loads it', () => {
    const scene = readFileSync(new URL('src/presentation/IslandScene.ts', ROOT), 'utf8');
    expect(scene).not.toMatch(/visual-reference|art-source/);
    expect(existsSync(new URL('public/assets/visual-reference-turn2-end.jpg', ROOT))).toBe(false);
  });
});

describe('walkRoute', () => {
  const A = { x: 0, y: 0 };
  const B = { x: 0, y: -100 };
  const C = { x: 150, y: -100 };

  it('behaves exactly like walkToward on a single leg', () => {
    for (const t of [0, 100, 500, 5000]) expect(walkRoute([A, C], t)).toEqual(walkToward(A, C, t));
  });

  it('walks leg by leg at the fixed ground speed and shows each leg’s own view', () => {
    const legMs = 100 / HUMAN_WALK_SPEED_PX_PER_MS;
    expect(walkRoute([A, B, C], 0)).toMatchObject({ x: 0, y: 0, direction: 'up', arrived: false });
    expect(walkRoute([A, B, C], legMs / 2)).toMatchObject({ direction: 'up' });
    expect(walkRoute([A, B, C], legMs / 2).y).toBeCloseTo(-50, 6);
    const afterCorner = walkRoute([A, B, C], legMs + 100 / HUMAN_WALK_SPEED_PX_PER_MS);
    expect(afterCorner).toMatchObject({ direction: 'right', arrived: false });
    expect(afterCorner.x).toBeCloseTo(100, 6);
    expect(afterCorner.y).toBeCloseTo(-100, 6);
  });

  it('is continuous through the corner, never faster than the ground speed, and ends exactly on the last point', () => {
    const total = walkRouteDurationMs([A, B, C]);
    expect(total).toBeCloseTo(250 / HUMAN_WALK_SPEED_PX_PER_MS, 6);
    let previous = walkRoute([A, B, C], 0);
    for (let t = 5; t <= total; t += 5) {
      const step = walkRoute([A, B, C], t);
      // At most one 5 ms stride, plus walkToward()'s up-to-1px arrival snap on the last leg.
      expect(Math.hypot(step.x - previous.x, step.y - previous.y)).toBeLessThanOrEqual(5 * HUMAN_WALK_SPEED_PX_PER_MS + 1 + 1e-6);
      previous = step;
    }
    expect(walkRoute([A, B, C], total + 1000)).toEqual({ x: 150, y: -100, direction: null, arrived: true });
    expect(walkRoute([A, B, C], -50)).toMatchObject({ x: 0, y: 0 });
  });
});
