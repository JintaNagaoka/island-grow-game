// Pure, deterministic pixel operations for deriving runtime world assets.
// Images are { width, height, pixels } with 8-bit RGBA, row-major pixels.

// A baked-in checkerboard square is near-neutral gray of mid brightness. Black
// outlines (too dark), cream/colored art (too chromatic) and white foam (too
// bright) never qualify, so the flood stops at the artwork's outline.
// `paleBlue` additionally accepts the faint blue-gray haze the source generator
// baked into the checkerboard beside the water (a pale, desaturated blue that is
// part of neither the water nor the foam); true water is far more saturated and
// rocks lean red, so neither qualifies.
export const BACKGROUND_RULE = {
  maxChroma: 14,
  minLuma: 100,
  maxLuma: 215,
  paleBlue: { maxChroma: 62, minBlueLead: 6, minLuma: 120, maxLuma: 225 },
};

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function isBackgroundColor(r, g, b, rule) {
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const l = luma(r, g, b);
  if (chroma <= rule.maxChroma && l >= rule.minLuma && l <= rule.maxLuma) return true;
  const haze = rule.paleBlue;
  return (
    haze !== undefined &&
    chroma <= haze.maxChroma &&
    b - r >= haze.minBlueLead &&
    l >= haze.minLuma &&
    l <= haze.maxLuma
  );
}

// Makes the checkerboard that is 4-connected to the image border transparent.
// Only exterior-connected background-like pixels are removed, so a gray rock
// or a light interior area enclosed by an outline is never touched. Edge pixels
// that blend foreground with checkerboard get an unmixed alpha (and foreground
// color) instead of a hard cut, which keeps the anti-aliasing and avoids a gray
// fringe. Returns a new image; the input is not modified.
export function removeExteriorBackground(image, rule = BACKGROUND_RULE) {
  const { width, height } = image;
  const src = image.pixels;
  const out = new Uint8Array(src);
  const removed = new Uint8Array(width * height);
  const stack = [];
  const tryPush = (index) => {
    if (removed[index]) return;
    const o = index * 4;
    if (!isBackgroundColor(src[o], src[o + 1], src[o + 2], rule)) return;
    removed[index] = 1;
    stack.push(index);
  };
  for (let x = 0; x < width; x += 1) {
    tryPush(x);
    tryPush((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    tryPush(y * width);
    tryPush(y * width + width - 1);
  }
  while (stack.length > 0) {
    const index = stack.pop();
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) tryPush(index - 1);
    if (x < width - 1) tryPush(index + 1);
    if (y > 0) tryPush(index - width);
    if (y < height - 1) tryPush(index + width);
  }

  // Breadth-first layers outward-in from the removed region. `bg` carries the
  // checkerboard color of the nearest removed pixel to every edge pixel.
  const FRINGE_DEPTH = 2;
  const depth = new Int8Array(width * height).fill(-1);
  const bg = new Uint8Array(width * height * 3);
  let frontier = [];
  for (let i = 0; i < removed.length; i += 1) {
    if (!removed[i]) continue;
    depth[i] = 0;
    bg.set([src[i * 4], src[i * 4 + 1], src[i * 4 + 2]], i * 3);
    frontier.push(i);
  }
  const neighbors = (index) => {
    const x = index % width;
    const y = (index - x) / width;
    const list = [];
    if (x > 0) list.push(index - 1);
    if (x < width - 1) list.push(index + 1);
    if (y > 0) list.push(index - width);
    if (y < height - 1) list.push(index + width);
    return list;
  };
  const edge = [];
  for (let layer = 1; layer <= FRINGE_DEPTH; layer += 1) {
    const next = [];
    for (const index of frontier) {
      for (const n of neighbors(index)) {
        if (depth[n] !== -1) continue;
        depth[n] = layer;
        bg.set(bg.subarray(index * 3, index * 3 + 3), n * 3);
        next.push(n);
        edge.push(n);
      }
    }
    frontier = next;
  }

  const INTERIOR_RADIUS = 4;
  const BLEND_TOLERANCE = 40;
  for (const index of edge) {
    const x = index % width;
    const y = (index - x) / width;
    // Foreground color estimate: mean of nearby pixels beyond the fringe band.
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let count = 0;
    for (let dy = -INTERIOR_RADIUS; dy <= INTERIOR_RADIUS; dy += 1) {
      for (let dx = -INTERIOR_RADIUS; dx <= INTERIOR_RADIUS; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (removed[n] || (depth[n] >= 1 && depth[n] <= FRINGE_DEPTH)) continue;
        sr += src[n * 4];
        sg += src[n * 4 + 1];
        sb += src[n * 4 + 2];
        count += 1;
      }
    }
    if (count === 0) continue;
    const fr = sr / count;
    const fg = sg / count;
    const fb = sb / count;
    const br = bg[index * 3];
    const bgG = bg[index * 3 + 1];
    const bb = bg[index * 3 + 2];
    const o = index * 4;
    // C = a*F + (1-a)*B  =>  a = (C-B).(F-B) / |F-B|^2, clamped to [0, 1].
    const dr = fr - br;
    const dg = fg - bgG;
    const db = fb - bb;
    const denom = dr * dr + dg * dg + db * db;
    if (denom < 400) continue; // foreground too close to the checkerboard to unmix
    const t = ((src[o] - br) * dr + (src[o + 1] - bgG) * dg + (src[o + 2] - bb) * db) / denom;
    // Only a pixel that actually lies on the checkerboard-to-foreground blend
    // line is unmixed. Anything else (e.g. a black outline next to a cream
    // interior) is real artwork and stays opaque.
    const residual = Math.hypot(
      src[o] - br - t * dr,
      src[o + 1] - bgG - t * dg,
      src[o + 2] - bb - t * db,
    );
    if (residual > BLEND_TOLERANCE) continue;
    const alpha = Math.min(1, Math.max(0, t));
    if (alpha >= 0.98) continue;
    if (alpha <= 0.02) {
      out[o + 3] = 0;
      continue;
    }
    // Recover the foreground color under the blend, never straying from F.
    const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));
    out[o] = clamp((src[o] - (1 - alpha) * br) / alpha);
    out[o + 1] = clamp((src[o + 1] - (1 - alpha) * bgG) / alpha);
    out[o + 2] = clamp((src[o + 2] - (1 - alpha) * bb) / alpha);
    out[o + 3] = Math.round(alpha * 255);
  }
  for (let i = 0; i < removed.length; i += 1) {
    if (removed[i]) out.set([0, 0, 0, 0], i * 4);
  }
  return { width, height, pixels: out };
}

// Smallest rectangle containing every pixel with alpha > 0, grown by `padding`
// transparent pixels (clamped to the canvas), as { left, top, width, height }.
export function opaqueBounds(image, padding = 0) {
  const { width, height, pixels } = image;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error('image has no visible pixels');
  const l = Math.max(0, left - padding);
  const t = Math.max(0, top - padding);
  const r = Math.min(width - 1, right + padding);
  const b = Math.min(height - 1, bottom + padding);
  return { left: l, top: t, width: r - l + 1, height: b - t + 1 };
}

export function crop(image, rect) {
  const pixels = new Uint8Array(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    const from = ((rect.top + y) * image.width + rect.left) * 4;
    pixels.set(image.pixels.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, pixels };
}

// Area-average downscale on premultiplied alpha, so transparent pixels never
// bleed their (arbitrary) RGB into the edge.
export function resizeArea(image, width, height) {
  const pass = (data, w, h, newW, newH, horizontal) => {
    const result = new Float64Array(newW * newH * 4);
    const length = horizontal ? w : h;
    const newLength = horizontal ? newW : newH;
    const ratio = length / newLength;
    const lines = horizontal ? h : w;
    for (let line = 0; line < lines; line += 1) {
      for (let o = 0; o < newLength; o += 1) {
        const start = o * ratio;
        const end = start + ratio;
        for (let i = Math.floor(start); i < Math.min(length, Math.ceil(end)); i += 1) {
          const weight = Math.min(i + 1, end) - Math.max(i, start);
          const from = horizontal ? (line * w + i) * 4 : (i * w + line) * 4;
          const to = horizontal ? (line * newW + o) * 4 : (o * newW + line) * 4;
          for (let c = 0; c < 4; c += 1) result[to + c] += (data[from + c] * weight) / ratio;
        }
      }
    }
    return result;
  };
  const premultiplied = new Float64Array(image.width * image.height * 4);
  for (let i = 0; i < image.width * image.height; i += 1) {
    const a = image.pixels[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c += 1) premultiplied[i * 4 + c] = image.pixels[i * 4 + c] * a;
    premultiplied[i * 4 + 3] = image.pixels[i * 4 + 3];
  }
  const horizontal = pass(premultiplied, image.width, image.height, width, image.height, true);
  const both = pass(horizontal, width, image.height, width, height, false);
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const alpha = both[i * 4 + 3];
    const a = alpha / 255;
    for (let c = 0; c < 3; c += 1) {
      pixels[i * 4 + c] = a > 0 ? Math.min(255, Math.round(both[i * 4 + c] / a)) : 0;
    }
    pixels[i * 4 + 3] = Math.round(alpha);
  }
  return { width, height, pixels };
}

// Clears every 8-connected group of visible pixels smaller than `maxArea`
// except the largest group. After exterior removal this drops leftover
// checkerboard pixels that were slightly brighter than the background rule and
// so were cut off from the border flood. Returns a new image.
export function removeSpeckles(image, maxArea) {
  const { width, height } = image;
  const pixels = new Uint8Array(image.pixels);
  const seen = new Uint8Array(width * height);
  const groups = [];
  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] || pixels[start * 4 + 3] === 0) continue;
    const members = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < members.length; cursor += 1) {
      const index = members[cursor];
      const x = index % width;
      const y = (index - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (seen[n] || pixels[n * 4 + 3] === 0) continue;
          seen[n] = 1;
          members.push(n);
        }
      }
    }
    groups.push(members);
  }
  const largest = groups.reduce((a, b) => (b.length > a.length ? b : a), []);
  for (const members of groups) {
    if (members === largest || members.length >= maxArea) continue;
    for (const index of members) pixels.set([0, 0, 0, 0], index * 4);
  }
  return { width, height, pixels };
}

// Peels light, desaturated gray pixels (leftover checkerboard that was blended
// with water at the cut edge) off the outer boundary of the artwork. Only
// pixels with at least `minTransparentNeighbors` transparent 8-neighbors are
// eligible, so interior gray and white surf (brighter than `maxLuma`) are never
// touched. Repeats `passes` times so a 2px-wide rim goes away. Returns a new image.
export function peelGrayRim(image, { passes = 2, maxChroma = 36, minLuma = 150, maxLuma = 222, minTransparentNeighbors = 3 } = {}) {
  const { width, height } = image;
  let pixels = new Uint8Array(image.pixels);
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(pixels);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const o = (y * width + x) * 4;
        if (pixels[o + 3] === 0) continue;
        const r = pixels[o];
        const g = pixels[o + 1];
        const b = pixels[o + 2];
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const l = luma(r, g, b);
        if (chroma > maxChroma || l < minLuma || l > maxLuma) continue;
        let clear = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height || pixels[(ny * width + nx) * 4 + 3] === 0) clear += 1;
          }
        }
        if (clear >= minTransparentNeighbors) next.set([0, 0, 0, 0], o);
      }
    }
    pixels = next;
  }
  return { width, height, pixels };
}
