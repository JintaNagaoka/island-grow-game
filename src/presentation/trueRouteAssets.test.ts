import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPng, type PngImage } from '../testSupport/png';
import {
  RIVER_SOURCE_PX,
  TRUE_ART_SIZE,
  TRUE_ART_STATUS,
  TRUE_PROPS,
  TRUE_PROP_LIST,
  type TrueAsset,
} from './trueRouteAssets';

const ASSETS = new URL('../../public/assets/', import.meta.url);
const read = (path: string): Uint8Array => readFileSync(new URL(path, ASSETS));

// SHA-256 of every imported candidate PNG, byte-identical to the supplied
// true-route-materials-v3 package (see art-source/true-route/TRUE_ASSET_MANIFEST.md).
// They are provisional candidates: pinning them records what was reviewed, not approval.
const SUPPLIED_SHA256: Readonly<Record<string, string>> = {
  'world/turn3/cave-practical.png': 'c8f3d610b51331a603665fbb6d5986d3a62c779ed6948314d711fdcebb746294',
  'world/turn3/dry-riverbed.png': '66365a7f64c5a793a516b69716a478ccff9a2ef82af033bc38d5a45dd5147512',
  'world/turn3/feed-trough.png': 'e9cb7b74e1552051c5128266c3bf1ea1857f8acbc5f6c829369729d9920ea0c3',
  'world/turn3/fence.png': '94be18fbec8d85020899391020b33a462a564dcd58367dbe3850c128f4db82d5',
  'world/turn3/guardian-child.png': 'c1153703d5e6c65f04d7c6a3e770f5dd7ac6e36deccb9d66eaa9711b49b8738c',
  'world/turn3/guardian-parent.png': 'dcd5452a43a6e1b880ef0e871630dda200ceef88d06a627dcc7db7dfb138e14b',
  'world/turn3/hut-second.png': 'ff92592468ac42414c852ba25136fba76232e31b3509cd92ffed6d78fed3c714',
  'world/turn3/livestock-child.png': '4b8c82b7b216559e8e7537ee142f16566de547d90cbbd09d5c2beb4497390e4d',
  'world/turn3/livestock-parent.png': 'ddb0ad2ebe9899d675dddf3c2f9d429d69039f5ccc7c08b6755ca685ad54453b',
  'world/turn3/stone-workshop.png': '6c5102156c5ddbaa8c6af814daf39c467699d35ce10b7a547640dcd41ee6743a',
  'world/turn3/water-trough-empty-candidate.png': '354f02af911b0451020fc735886ee438ca9e8a7ef631c8b87a92dcb2d038b966',
  'world/turn3/water-trough.png': '9c8bf0d9c2dec1c74f92e7742f04e312680f73232a1a664a8c3f7edc10093783',
  // The supplied shrine cave exterior (true-route-review-fix-v2 package, asset-manifest.json).
  'world/turn4/cave-shrine-exterior.png': '46bd9980a793a6376dbe8f44f1fb9ec9a9fd991d48ce40c571f35af8f32d3511',
  'world/turn4/flowing-riverbed-candidate.png': '2fcfb954d415616b7984b3890a5317b2f294f1a3ecdf297354b7f2a6e7ba24ea',
  'world/turn4/spring-pond-candidate.png': '72c115c8eb4e4426adafad46299ab295d74e7e9e8cbdd170006e6d0d2274739d',
};

function bounds(image: PngImage, minAlpha = 128): { left: number; right: number; top: number; bottom: number } {
  let left = image.width;
  let right = -1;
  let top = image.height;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] < minAlpha) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, right, top, bottom };
}

// Mean x of the opaque pixels in rows [from, to].
function meanX(image: PngImage, from: number, to: number): number {
  let sum = 0;
  let count = 0;
  for (let y = from; y <= to; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] < 128) continue;
      sum += x;
      count += 1;
    }
  }
  return sum / count;
}

const filePath = (asset: TrueAsset): string => `${asset.dir.replace('/assets/', '')}${asset.filename}`;

describe('TRUE route candidate art is provisional', () => {
  it('is labelled provisional everywhere it is described', () => {
    expect(TRUE_ART_STATUS).toBe('provisional');
  });

  it('ships exactly the supplied candidate bytes and nothing else in the new folders', () => {
    const shipped = [
      ...['world/turn3', 'world/turn4'].flatMap((dir) =>
        readdirSync(new URL(`${dir}/`, ASSETS))
          .filter((name) => name.endsWith('.png'))
          .map((name) => `${dir}/${name}`),
      ),
    ].sort();
    expect(shipped).toEqual(Object.keys(SUPPLIED_SHA256).sort());
    for (const [path, expected] of Object.entries(SUPPLIED_SHA256)) {
      expect(createHash('sha256').update(read(path)).digest('hex'), path).toBe(expected);
    }
  });

  it('registers every prop that ships, once', () => {
    expect(TRUE_PROP_LIST.map(filePath).sort()).toEqual(Object.keys(SUPPLIED_SHA256).sort());
    const keys = TRUE_PROP_LIST.map((a) => a.textureKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('prop PNGs', () => {
  it.each(TRUE_PROP_LIST.map((asset) => [asset.filename, asset] as const))('%s is 512x512 transparent RGBA with a ground anchor on its art', (_name, asset) => {
    const image = readPng(read(filePath(asset)));
    expect([image.width, image.height, image.bitDepth, image.colorType]).toEqual([TRUE_ART_SIZE, TRUE_ART_SIZE, 8, 6]);
    expect(image.minAlpha).toBe(0);
    expect(image.maxAlpha).toBeGreaterThanOrEqual(250);
    expect([asset.width, asset.height]).toEqual([TRUE_ART_SIZE, TRUE_ART_SIZE]);
    const box = bounds(image);
    expect(asset.groundAnchor.x).toBeGreaterThanOrEqual(box.left);
    expect(asset.groundAnchor.x).toBeLessThanOrEqual(box.right);
    // The anchor is the art's bottom edge (or its stream end), never floating above it.
    expect(Math.abs(asset.groundAnchor.y - box.bottom)).toBeLessThanOrEqual(8);
  });

  it('keeps the dry and flowing riverbeds on one footprint so the wet one replaces the dry one in place', () => {
    const dry = readPng(read('world/turn3/dry-riverbed.png'));
    const flowing = readPng(read('world/turn4/flowing-riverbed-candidate.png'));
    for (let row = 60; row <= 460; row += 40) {
      expect(Math.abs(meanX(dry, row, row + 4) - meanX(flowing, row, row + 4)), `row ${row}`).toBeLessThanOrEqual(5);
    }
    expect(TRUE_PROPS.dryRiverbed.baseScale).toBe(TRUE_PROPS.flowingRiverbed.baseScale);
    expect(Math.abs(TRUE_PROPS.dryRiverbed.groundAnchor.x - TRUE_PROPS.flowingRiverbed.groundAnchor.x)).toBeLessThanOrEqual(2);
    // Its source end is where the spring's outlet joins.
    for (const image of [dry, flowing]) {
      const top = bounds(image).top;
      expect(Math.abs(meanX(image, top, top + 6) - RIVER_SOURCE_PX.x)).toBeLessThanOrEqual(6);
      expect(Math.abs(top - RIVER_SOURCE_PX.y)).toBeLessThanOrEqual(6);
    }
  });

  it('anchors the spring pond at the end of its outlet stream, on the lower left', () => {
    const pond = readPng(read('world/turn4/spring-pond-candidate.png'));
    const box = bounds(pond);
    expect(Math.abs(meanX(pond, box.bottom - 6, box.bottom) - TRUE_PROPS.springPond.groundAnchor.x)).toBeLessThanOrEqual(10);
    expect(TRUE_PROPS.springPond.groundAnchor.x).toBeLessThan(box.left + (box.right - box.left) / 4);
    // Candidate note: the pond reaches the canvas edge, so it must be fitted by scale, not cropped.
    expect(box.left).toBeLessThanOrEqual(80);
  });

  it('draws the guardian pair a little larger than the livestock pair it transforms from, child still smaller than parent', () => {
    const width = (name: string): number => {
      const box = bounds(readPng(read(`world/turn3/${name}`)));
      return box.right - box.left;
    };
    // The guardian art fills about the same canvas width as the livestock art, so the drawn size
    // ratio is the baseScale ratio: larger so the pale pair reads on a phone, but still the same
    // animal (a presentation choice; human review judges how it looks).
    const parentRatio = (width('guardian-parent.png') * TRUE_PROPS.guardianParent.baseScale) / (width('livestock-parent.png') * TRUE_PROPS.livestockParent.baseScale);
    const childRatio = (width('guardian-child.png') * TRUE_PROPS.guardianChild.baseScale) / (width('livestock-child.png') * TRUE_PROPS.livestockChild.baseScale);
    for (const ratio of [parentRatio, childRatio]) {
      expect(ratio).toBeGreaterThan(1);
      expect(ratio).toBeLessThan(1.4);
    }
    expect(TRUE_PROPS.livestockChild.baseScale).toBeLessThan(TRUE_PROPS.livestockParent.baseScale);
    expect(TRUE_PROPS.guardianChild.baseScale / TRUE_PROPS.guardianParent.baseScale).toBeLessThan(1);
  });

  it('uses the empty basin before Turn 4 and the existing filled one after, as different textures', () => {
    expect(TRUE_PROPS.basinEmpty.filename).toBe('water-trough-empty-candidate.png');
    expect(TRUE_PROPS.basinFilled.filename).toBe('water-trough.png');
    expect(TRUE_PROPS.basinEmpty.textureKey).not.toBe(TRUE_PROPS.basinFilled.textureKey);
    expect(TRUE_PROPS.basinEmpty.baseScale).toBe(TRUE_PROPS.basinFilled.baseScale);
  });
});

describe('human action candidates ship as composite work sprites, unchanged', () => {
  const sourceDir = new URL('../../art-source/true-route/human-action-candidates/', import.meta.url);
  const candidates = readdirSync(sourceDir).filter((name) => name.endsWith('.png'));

  it('ship byte-for-byte what art-source holds: the same ten PNGs, none edited or derived', () => {
    expect(candidates).toHaveLength(10);
    expect(readdirSync(new URL('human/actions/', ASSETS)).sort()).toEqual([...candidates].sort());
    for (const name of candidates) {
      const source = createHash('sha256').update(readFileSync(new URL(name, sourceDir))).digest('hex');
      const shipped = createHash('sha256').update(read(`human/actions/${name}`)).digest('hex');
      expect(shipped, name).toBe(source);
    }
  });

  it('keeps the two build frames exactly as supplied in the review package', () => {
    const supplied: Record<string, string> = {
      'build-1.png': 'c2aefa62b7931d32e7de1b01c7e6903a12fbcc2a9278fdd39299ba4752054d68',
      'build-2.png': '60e978558f809d35cbc53a8f6db1446dbcc3b73e459bf083dc9ad77d2fc5cf36',
    };
    for (const [name, hash] of Object.entries(supplied)) {
      expect(createHash('sha256').update(read(`human/actions/${name}`)).digest('hex'), name).toBe(hash);
    }
  });
});

describe('superseded candidates', () => {
  it('are kept out of the runtime tree, in art-source, so nothing stale can be drawn or shipped', () => {
    const superseded = readdirSync(new URL('../../art-source/true-route/superseded/', import.meta.url)).sort();
    expect(superseded).toEqual(['cave-shrine-candidate.png', 'mature-farm.png']);
    const source = readFileSync(new URL('./trueRouteAssets.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    for (const stale of ['mature-farm', 'cave-shrine-candidate', 'matureFarm', 'caveShrine']) expect(source.includes(stale), stale).toBe(false);
  });
});
