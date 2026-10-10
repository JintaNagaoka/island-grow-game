import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../../scripts/pngCodec.mjs';
import {
  crop,
  opaqueBounds,
  peelGrayRim,
  removeExteriorBackground,
  removeSpeckles,
  resizeArea,
  type RgbaImage,
} from '../../scripts/worldAssetPixels.mjs';
import { readPng } from '../testSupport/png';

const SIZE = 64;

function setPixel(image: RgbaImage, x: number, y: number, rgba: readonly number[]): void {
  image.pixels.set(rgba, (y * image.width + x) * 4);
}

const alphaAt = (image: RgbaImage, x: number, y: number): number =>
  image.pixels[(y * image.width + x) * 4 + 3];

// A noisy gray checkerboard (light 192 / dark 130) with a black-outlined cream
// disc in the middle. The disc contains a gray patch the same color as the
// checkerboard that must survive because it is enclosed by the outline.
function checkerboardWithDisc(): RgbaImage {
  const image: RgbaImage = { width: SIZE, height: SIZE, pixels: new Uint8Array(SIZE * SIZE * 4) };
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const light = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      const v = (light ? 192 : 130) + ((x * 7 + y * 3) % 3);
      const distance = Math.hypot(x - 31.5, y - 31.5);
      if (distance <= 18) setPixel(image, x, y, [0, 0, 0, 255]);
      else if (distance <= 22) setPixel(image, x, y, [v, v, v, 255]);
      else setPixel(image, x, y, [v, v, v, 255]);
      if (distance <= 16) setPixel(image, x, y, [250, 235, 190, 255]);
      if (distance <= 5) setPixel(image, x, y, [192, 192, 192, 255]);
    }
  }
  return image;
}

describe('world asset background removal', () => {
  it('clears the exterior checkerboard but keeps the outline, art and enclosed gray', () => {
    const result = removeExteriorBackground(checkerboardWithDisc());
    expect(alphaAt(result, 0, 0)).toBe(0);
    expect(alphaAt(result, SIZE - 1, SIZE - 1)).toBe(0);
    expect(alphaAt(result, 3, 40)).toBe(0);
    // Outline ring, cream body and the enclosed gray patch stay fully opaque.
    expect(alphaAt(result, 31, 14)).toBe(255);
    expect(alphaAt(result, 31, 22)).toBe(255);
    expect(alphaAt(result, 31, 31)).toBe(255);
    expect(Array.from(result.pixels.slice((31 * SIZE + 31) * 4, (31 * SIZE + 31) * 4 + 3))).toEqual([
      192, 192, 192,
    ]);
  });

  it('does not modify its input and is deterministic', () => {
    const input = checkerboardWithDisc();
    const snapshot = new Uint8Array(input.pixels);
    const a = removeExteriorBackground(input);
    const b = removeExteriorBackground(input);
    expect(input.pixels).toEqual(snapshot);
    expect(encodePng(a)).toEqual(encodePng(b));
  });

  it('unmixes an anti-aliased edge into partial alpha instead of a gray fringe', () => {
    const image: RgbaImage = { width: 40, height: 8, pixels: new Uint8Array(40 * 8 * 4) };
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        // Gray background on the left, saturated blue foreground on the right,
        // one 50% blend column at x = 20.
        if (x < 20) setPixel(image, x, y, [160, 160, 160, 255]);
        else if (x === 20) setPixel(image, x, y, [80, 165, 205, 255]);
        else setPixel(image, x, y, [0, 170, 250, 255]);
      }
    }
    // Bridge the foreground to the border so it is not mistaken for background.
    const result = removeExteriorBackground(image);
    expect(alphaAt(result, 10, 4)).toBe(0);
    expect(alphaAt(result, 30, 4)).toBe(255);
    const blend = alphaAt(result, 20, 4);
    expect(blend).toBeGreaterThan(90);
    expect(blend).toBeLessThan(170);
  });

  it('removes exterior pale blue-gray haze but keeps saturated water and reddish rock', () => {
    const image: RgbaImage = { width: 30, height: 4, pixels: new Uint8Array(30 * 4 * 4) };
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 30; x += 1) {
        if (x < 10) setPixel(image, x, y, [185, 200, 215, 255]); // pale blue haze
        else if (x < 20) setPixel(image, x, y, [20, 175, 245, 255]); // water
        else setPixel(image, x, y, [150, 125, 110, 255]); // rock
      }
    }
    const result = removeExteriorBackground(image);
    expect(alphaAt(result, 5, 2)).toBe(0);
    expect(alphaAt(result, 15, 2)).toBe(255);
    expect(alphaAt(result, 25, 2)).toBe(255);
  });

  it('peels a light gray rim off the outer boundary only', () => {
    const image: RgbaImage = { width: 12, height: 12, pixels: new Uint8Array(12 * 12 * 4) };
    for (let y = 2; y < 10; y += 1) for (let x = 2; x < 10; x += 1) setPixel(image, x, y, [20, 175, 245, 255]);
    for (let x = 2; x < 10; x += 1) setPixel(image, x, 2, [190, 190, 190, 255]); // gray rim
    for (let x = 3; x < 9; x += 1) setPixel(image, x, 6, [190, 190, 190, 255]); // interior gray
    const result = peelGrayRim(image);
    expect(alphaAt(result, 5, 2)).toBe(0);
    expect(alphaAt(result, 5, 6)).toBe(255);
    expect(alphaAt(result, 5, 5)).toBe(255);
  });

  it('drops detached specks but keeps the main artwork', () => {
    const image: RgbaImage = { width: 32, height: 32, pixels: new Uint8Array(32 * 32 * 4) };
    for (let y = 4; y < 20; y += 1) for (let x = 4; x < 20; x += 1) setPixel(image, x, y, [9, 9, 9, 255]);
    setPixel(image, 28, 28, [200, 200, 200, 255]);
    const result = removeSpeckles(image, 10);
    expect(alphaAt(result, 28, 28)).toBe(0);
    expect(alphaAt(result, 10, 10)).toBe(255);
  });

  it('crops to the visible bounds and resizes without bleeding transparent color', () => {
    const image: RgbaImage = { width: 16, height: 16, pixels: new Uint8Array(16 * 16 * 4) };
    for (let y = 4; y < 12; y += 1) for (let x = 2; x < 10; x += 1) setPixel(image, x, y, [200, 50, 20, 255]);
    // Transparent pixels carry misleading RGB that must not leak into the edge.
    for (let i = 0; i < 16 * 16; i += 1) if (image.pixels[i * 4 + 3] === 0) image.pixels.set([0, 255, 0], i * 4);
    const bounds = opaqueBounds(image);
    expect(bounds).toEqual({ left: 2, top: 4, width: 8, height: 8 });
    const small = resizeArea(crop(image, bounds), 4, 4);
    expect(Array.from(small.pixels.slice(0, 4))).toEqual([200, 50, 20, 255]);
    const edge = resizeArea(image, 8, 8);
    // The pixel covering one half transparent / one half opaque stays pure red-orange.
    expect(edge.pixels[(2 * 8 + 1) * 4 + 1]).toBe(50);
  });

  it('round-trips 8-bit RGBA PNGs losslessly', () => {
    const image = checkerboardWithDisc();
    const bytes = encodePng(image);
    expect(decodePng(bytes).pixels).toEqual(image.pixels);
    const png = readPng(bytes);
    expect([png.bitDepth, png.colorType, png.width, png.height]).toEqual([8, 6, SIZE, SIZE]);
  });
});
