import { inflateSync } from 'node:zlib';

export interface PngImage {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly minAlpha: number;
  readonly maxAlpha: number;
  // 8-bit RGBA, row-major, width * height * 4 bytes.
  readonly pixels: Uint8Array;
}

// Just enough PNG decoding to inspect an 8-bit RGBA, non-interlaced image.
export function readPng(bytes: Uint8Array): PngImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => bytes[index] === byte)) {
    throw new Error('not a PNG');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];
  for (let offset = 8; offset < bytes.length; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = header.getUint32(0);
      height = header.getUint32(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    return { width, height, bitDepth, colorType, minAlpha: -1, maxAlpha: -1, pixels: new Uint8Array(0) };
  }

  const raw = inflateSync(Uint8Array.from(idat.flatMap((chunk) => Array.from(chunk))));
  const bpp = 4;
  const stride = width * bpp;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i += 1) {
      const value = raw[y * (stride + 1) + 1 + i];
      const left = i >= bpp ? pixels[y * stride + i - bpp] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= bpp ? pixels[(y - 1) * stride + i - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + i] = (value + predictor) & 0xff;
    }
  }
  let minAlpha = 255;
  let maxAlpha = 0;
  for (let i = 3; i < pixels.length; i += bpp) {
    minAlpha = Math.min(minAlpha, pixels[i]);
    maxAlpha = Math.max(maxAlpha, pixels[i]);
  }
  return { width, height, bitDepth, colorType, minAlpha, maxAlpha, pixels };
}
