import { deflateSync, inflateSync } from 'node:zlib';

// Minimal 8-bit, non-interlaced RGB/RGBA PNG codec so the asset derivation needs
// no dependencies. Pixels are always handled as RGBA, row-major.
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function decodePng(bytes) {
  if (!SIGNATURE.every((byte, i) => bytes[i] === byte)) throw new Error('not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat = [];
  for (let offset = 8; offset < bytes.length; ) {
    const length = view.getUint32(offset);
    const type = Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString('latin1');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error('only 8-bit non-interlaced RGB/RGBA PNGs are supported');
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i += 1) {
      const value = raw[y * (stride + 1) + 1 + i];
      const left = i >= channels ? rows[y * stride + i - channels] : 0;
      const up = y > 0 ? rows[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= channels ? rows[(y - 1) * stride + i - channels] : 0;
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
      rows[y * stride + i] = (value + predictor) & 0xff;
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    for (let c = 0; c < 3; c += 1) pixels[p * 4 + c] = rows[p * channels + c];
    pixels[p * 4 + 3] = channels === 4 ? rows[p * channels + 3] : 255;
  }
  return { width, height, pixels };
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng({ width, height, pixels }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const zero = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : zero;
    // Pick the filter with the smallest sum of absolute residuals (a standard
    // deterministic heuristic); only affects size, never decoded pixels.
    let best = null;
    for (let filter = 0; filter <= 4; filter += 1) {
      const out = new Uint8Array(stride);
      let cost = 0;
      for (let i = 0; i < stride; i += 1) {
        const left = i >= 4 ? row[i - 4] : 0;
        const up = prior[i];
        const upLeft = i >= 4 ? prior[i - 4] : 0;
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
        const residual = (row[i] - predictor) & 0xff;
        out[i] = residual;
        cost += residual < 128 ? residual : 256 - residual;
      }
      if (best === null || cost < best.cost) best = { filter, out, cost };
    }
    raw[y * (stride + 1)] = best.filter;
    raw.set(best.out, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
