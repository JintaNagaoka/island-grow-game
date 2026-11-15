import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPng, type PngImage } from '../testSupport/png';
import { snapshotAtMs } from '../testSupport/trueRoute';
import { SECOND_RESIDENT_ID, THIRD_RESIDENT_ID, VILLAGE_RESIDENT_IDS } from '../game/worldState';
import { ROUTINES, arrivalMs, workStartMs } from './crew';
import {
  ACTION_FRAMES,
  ACTION_FRAME_MS,
  ACTION_IDS,
  BUILD_STRIKE_REACH,
  HUMAN_ACTION_ASSET_LIST,
  TARGET_HEAD_RADIUS_PX,
  actionFrameIndex,
  actionPose,
  contactOffset,
  frameSizeMul,
  type ActionFrame,
} from './humanActions';
import { HUMAN_SPRITE_SCALE } from './humanAssets';
import { HUT_WALL_PX, LAYOUT } from './layout';
import { computeResidentVisuals } from './residents';

const ROOT = new URL('../../', import.meta.url);
const load = (path: string): PngImage => readPng(readFileSync(new URL(path, ROOT)));
const frameImage = (frame: ActionFrame): PngImage => load(`public/assets/human/actions/${frame.filename}`);
const alphaAt = (image: PngImage, x: number, y: number): number => image.pixels[(y * image.width + x) * 4 + 3];
const T = LAYOUT.true;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

function lowestOpaqueRow(image: PngImage): number {
  for (let y = image.height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < image.width; x += 1) if (alphaAt(image, x, y) >= 128) return y;
  }
  return -1;
}

// The feet: opaque pixels within 10 rows of the lowest one, split into separate blobs. The
// tool or load that touches the ground (hammer head, stone) is a blob too, but it is never one
// of the first two from the left, which are the feet.
function feetExtent(image: PngImage): { left: number; right: number } {
  const bottom = lowestOpaqueRow(image);
  const columns: number[] = [];
  for (let x = 0; x < image.width; x += 1) {
    for (let y = bottom - 10; y <= bottom; y += 1) {
      if (alphaAt(image, x, y) >= 128) {
        columns.push(x);
        break;
      }
    }
  }
  const blobs: number[][] = [[columns[0]]];
  for (let i = 1; i < columns.length; i += 1) {
    if (columns[i] - columns[i - 1] > 12) blobs.push([]);
    blobs[blobs.length - 1].push(columns[i]);
  }
  // Two feet: the first two blobs (a merged pair is one blob).
  const feet = blobs.slice(0, 2).flat();
  return { left: Math.min(...feet), right: Math.max(...feet) };
}

// Radius of the largest circle that fits in the cream-coloured head (chamfer distance transform).
function headRadius(image: PngImage): number {
  const { width, height } = image;
  const cream = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2], image.pixels[i + 3]];
      cream[y * width + x] = a > 200 && r > 225 && g > 215 && b < 200 && b > 80 ? 1 : 0;
    }
  }
  const d = new Float64Array(width * height);
  for (let i = 0; i < d.length; i += 1) d[i] = cream[i] ? 1e9 : 0;
  const S = Math.SQRT2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!cream[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - width] + 1);
        if (x > 0) v = Math.min(v, d[i - width - 1] + S);
        if (x < width - 1) v = Math.min(v, d[i - width + 1] + S);
      }
      d[i] = v;
    }
  }
  let best = 0;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      if (!cream[i]) continue;
      let v = d[i];
      if (x < width - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < height - 1) {
        v = Math.min(v, d[i + width] + 1);
        if (x < width - 1) v = Math.min(v, d[i + width + 1] + S);
        if (x > 0) v = Math.min(v, d[i + width - 1] + S);
      }
      d[i] = v;
      best = Math.max(best, v);
    }
  }
  return best;
}

describe('action frames match the existing animation contract', () => {
  const animation = JSON.parse(readFileSync(new URL('art-source/true-route/human-action-candidates/animation.json', ROOT), 'utf8')) as {
    frameDurationMs: number;
    direction: string;
    rootMotion: boolean;
    animations: { id: string; sequence: string[] }[];
  };

  it('uses the existing 300 ms per frame, right-facing, no-root-motion definition as its initial values', () => {
    expect(ACTION_FRAME_MS).toBe(animation.frameDurationMs);
    expect(animation.direction).toBe('right');
    expect(animation.rootMotion).toBe(false);
    for (const { id, sequence } of animation.animations) {
      expect(ACTION_FRAMES[id as keyof typeof ACTION_FRAMES].map((frame) => frame.filename), id).toEqual(sequence);
    }
    expect([...ACTION_IDS].sort()).toEqual(animation.animations.map((entry) => entry.id).sort());
  });

  it('chooses the frame from the logical clock: frame 0 first, then alternating every 300 ms', () => {
    expect([0, 299, 300, 599, 600, 900].map(actionFrameIndex)).toEqual([0, 0, 1, 1, 0, 1]);
    expect(actionFrameIndex(-5)).toBe(0);
  });
});

describe.each(HUMAN_ACTION_ASSET_LIST.map((frame) => [frame.filename, frame] as const))('%s', (_name, frame) => {
  const image = frameImage(frame);

  it('is a 512x512 transparent RGBA frame', () => {
    expect([image.width, image.height, image.bitDepth, image.colorType]).toEqual([512, 512, 8, 6]);
    expect(image.minAlpha).toBe(0);
  });

  it('is anchored on its feet: the lowest opaque row, and the middle of the two feet', () => {
    expect(Math.abs(frame.anchor.y - lowestOpaqueRow(image))).toBeLessThanOrEqual(1);
    const { left, right } = feetExtent(image);
    expect(Math.abs(frame.anchor.x - (left + right) / 2)).toBeLessThanOrEqual(3);
  });

  it('has the head radius it is scaled by, so every frame shows the approved head size', () => {
    expect(Math.abs(headRadius(image) - frame.headRadius)).toBeLessThanOrEqual(2.5);
    expect(frame.headRadius * HUMAN_SPRITE_SCALE * frameSizeMul(frame)).toBeCloseTo(TARGET_HEAD_RADIUS_PX * HUMAN_SPRITE_SCALE, 6);
  });

  it('puts its contact point on the tool or load, not in empty space', () => {
    if (frame.contact === undefined) return;
    let near = 0;
    for (let dy = -8; dy <= 8; dy += 1) for (let dx = -8; dx <= 8; dx += 1) near = Math.max(near, alphaAt(image, frame.contact.x + dx, frame.contact.y + dy));
    expect(near).toBeGreaterThanOrEqual(200);
  });
});

describe('the frames of one action keep a stable baseline and scale', () => {
  for (const id of ACTION_IDS) {
    it(`${id}: feet stay put and the head keeps its size between its two frames`, () => {
      const [a, b] = ACTION_FRAMES[id];
      const unit = (frame: ActionFrame) => HUMAN_SPRITE_SCALE * frameSizeMul(frame);
      // Feet, in design pixels from the ground point: both edges move less than 2.5 px.
      const [feetA, feetB] = [feetExtent(frameImage(a)), feetExtent(frameImage(b))];
      expect(Math.abs((feetA.left - a.anchor.x) * unit(a) - (feetB.left - b.anchor.x) * unit(b))).toBeLessThanOrEqual(2.5);
      expect(Math.abs((feetA.right - a.anchor.x) * unit(a) - (feetB.right - b.anchor.x) * unit(b))).toBeLessThanOrEqual(2.5);
      // The baseline: both frames stand on their own lowest row, to within a pixel of the drawing's lowest.
      expect(Math.abs((lowestOpaqueRow(frameImage(a)) - a.anchor.y) * unit(a))).toBeLessThanOrEqual(0.15);
      expect(Math.abs((lowestOpaqueRow(frameImage(b)) - b.anchor.y) * unit(b))).toBeLessThanOrEqual(0.15);
      // Scale: the head is the same size in both.
      expect(a.headRadius * unit(a)).toBeCloseTo(b.headRadius * unit(b), 6);
      // And the sprite's origin puts that ground point on the resident's.
      const pose = actionPose(id, 0, { x: 100, y: 200 }, 1);
      expect([pose.x, pose.y, pose.originX, pose.originY]).toEqual([100, 200, a.anchor.x / 512, a.anchor.y / 512]);
    });
  }

  it('really changes the body between the build frames: the arm and the body are drawn differently', () => {
    const [raised, strike] = ACTION_FRAMES.build.map(frameImage);
    let both = 0;
    let differing = 0;
    for (let i = 0; i < 512 * 512; i += 1) {
      const a = raised.pixels[i * 4 + 3] >= 128;
      const b = strike.pixels[i * 4 + 3] >= 128;
      if (a || b) both += 1;
      if (a !== b) differing += 1;
    }
    // About half of the drawn pixels are in different places (raised mallet and arm versus the bent strike).
    expect(differing / both).toBeGreaterThan(0.4);
    // And neither is the idle standing pose.
    expect(actionPose('build', 0, { x: 0, y: 0 }, 1).asset).not.toBe('idle');
  });
});

describe('facing', () => {
  it('mirrors the contact point with the facing, leaving the feet where they are', () => {
    for (const id of ['build', 'dig', 'gather', 'water-carry'] as const) {
      const index = id === 'gather' ? 0 : 1;
      const right = contactOffset(id, index, 1)!;
      const left = contactOffset(id, index, -1)!;
      expect(left.x).toBeCloseTo(-right.x, 9);
      expect(left.y).toBeCloseTo(right.y, 9);
      const pose = actionPose(id, index, { x: 50, y: 60 }, -1);
      expect([pose.facing, pose.x, pose.y]).toEqual([-1, 50, 60]);
    }
    expect(BUILD_STRIKE_REACH.x).toBeGreaterThan(20);
    expect(BUILD_STRIKE_REACH.y).toBeGreaterThan(3);
  });
});

describe('the builders strike toward what they build', () => {
  const strike = (at: { x: number; y: number }, facing: -1 | 1) => {
    const offset = contactOffset('build', 1, facing)!;
    return { x: at.x + offset.x, y: at.y + offset.y };
  };

  it('puts the mallet face on the second hut’s visible left wall, facing the hut', () => {
    expect(distance(strike(T.hutSite, 1), T.hutFace)).toBeLessThanOrEqual(1.5);
    expect(T.hutFace.x).toBeGreaterThan(T.hutSite.x);
    // The wall point is on the hut's art: opaque, with open air just left of it, at the hut's own scale.
    const hut = load('public/assets/world/turn3/hut-second.png');
    expect(alphaAt(hut, HUT_WALL_PX.x, HUT_WALL_PX.y)).toBeGreaterThanOrEqual(128);
    expect(alphaAt(hut, HUT_WALL_PX.x - 14, HUT_WALL_PX.y)).toBeLessThan(128);
    expect(T.hutFace.x).toBeCloseTo(T.secondHut.x + (HUT_WALL_PX.x - 256) * 0.3, 6);
    expect(T.hutFace.y).toBeLessThan(T.secondHut.y);
  });

  it('puts it on the finished furnace’s right face from the right, facing left (the mirrored frames)', () => {
    expect(distance(strike(T.furnaceStand, -1), T.furnaceFace)).toBeLessThanOrEqual(1.5);
    expect(T.furnaceFace.x).toBeLessThan(T.furnaceStand.x);
    // The same strike facing right would hit the wrong side.
    expect(strike(T.furnaceStand, 1).x).toBeGreaterThan(T.furnaceStand.x);
  });

  it('puts it on each added home’s wall', () => {
    T.homeSites.forEach((site, index) => {
      expect(distance(strike(site, 1), T.homeFaces[index]), `home ${index}`).toBeLessThanOrEqual(1.5);
      expect(T.homeFaces[index].x).toBeGreaterThan(site.x);
    });
  });

  it('keeps the builder’s own feet in the right place at every moment of the hut build, facing the hut, with chips at the face', () => {
    const hut = ROUTINES['human-builds-hut']![THIRD_RESIDENT_ID];
    const start = workStartMs(hut, THIRD_RESIDENT_ID, 'build')!;
    const strikes = [0, 1, 2, 3].map((n) => start + n * ACTION_FRAME_MS);
    for (const [index, ms] of strikes.entries()) {
      const snapshot = snapshotAtMs('human-builds-hut', ms + 20);
      const visual = computeResidentVisuals(snapshot).find((candidate) => candidate.id === THIRD_RESIDENT_ID)!;
      expect(visual.pose.facing).toBe(1);
      expect(visual.pose.x).toBeCloseTo(T.hutSite.x, 6);
      expect(visual.pose.y).toBeCloseTo(T.hutSite.y, 6);
      expect(visual.pose.asset).toBe(index % 2 === 0 ? 'action-build-1' : 'action-build-2');
      const chips = visual.layers?.effect;
      if (index % 2 === 1) expect(distance(chips!, T.hutFace)).toBeLessThanOrEqual(1.5);
      else expect(chips).toBeNull();
    }
  });

  it('faces the furnace from the right while it is built, and each home from the left', () => {
    const furnace = ROUTINES['furnace-lights']![THIRD_RESIDENT_ID];
    const furnaceStrike = workStartMs(furnace, THIRD_RESIDENT_ID, 'build')! + ACTION_FRAME_MS + 20;
    const visual = computeResidentVisuals(snapshotAtMs('furnace-lights', furnaceStrike)).find((v) => v.id === THIRD_RESIDENT_ID)!;
    expect(visual.pose.facing).toBe(-1);
    expect(distance(visual.pose, T.furnaceStand)).toBeLessThanOrEqual(1.5);
    expect(distance(visual.layers!.effect!, T.furnaceFace)).toBeLessThanOrEqual(1.5);
    VILLAGE_RESIDENT_IDS.slice(0, 2).forEach((id, index) => {
      const place = index === 0 ? 'home-a' : 'home-b';
      const arrive = arrivalMs(ROUTINES['village-built']![id], id, place)!;
      const worker = computeResidentVisuals(snapshotAtMs('village-built', arrive + ACTION_FRAME_MS + 20)).find((v) => v.id === id)!;
      expect(worker.pose.facing).toBe(1);
      expect(distance(worker.layers!.effect!, T.homeFaces[index])).toBeLessThanOrEqual(1.5);
    });
    expect(SECOND_RESIDENT_ID).toBeDefined();
  });
});
