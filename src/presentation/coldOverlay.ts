import type { HumanWalkDirection } from './humanAssets';

// Cold presentation for the 12 approved walk frames, which are base-body art
// with no isCold variant. This layer only re-applies the treatment already
// established by the approved *_isCold PNGs and adds no other visual language.
//
// Evidence (visual inspection of public/assets/human/{idle,notice,rise,warm,
// cold,walk1,walk2}_isCold.png): every one carries exactly two things relative
// to its normal PNG - (1) the head interior tinted light blue at the top and
// fading to the cream body colour about halfway down, and (2) thin light-blue
// zigzag shiver marks beside the head and torso, two on each side. The orange
// "!" marks on notice are notice art, not part of the cold treatment, and are
// not reused here.
//
// Limit of that evidence: head circle, tint colours/fade and mark coordinates
// below are approximated by eye from those images, not pixel-measured, and the
// marks are one shared set rather than per-pose placements. Exact fidelity is
// NOT established and the look REQUIRES HUMAN REVIEW; if it is not accepted the
// fix is approved walk isCold art (selected through humanAssets), not more
// overlay. Geometry is in 512px source-frame pixels and is pure data; the Scene
// only draws it, and only while WorldState.isCold is true.
export interface HeadCircle {
  readonly cx: number;
  readonly cy: number;
  // Radius inside the black outline, so the tint never covers the line art.
  readonly r: number;
}

// The head is fixed per direction while only the legs change between frames.
const HEADS: Readonly<Record<HumanWalkDirection, HeadCircle>> = {
  up: { cx: 260, cy: 185, r: 88 },
  down: { cx: 260, cy: 185, r: 88 },
  left: { cx: 252, cy: 184, r: 87 },
  right: { cx: 261, cy: 185, r: 87 },
};

export const COLD_HEAD_COLOR = 0x3cb4f8;
export const COLD_MARK_COLOR = 0x5cc8f5;
export const COLD_MARK_WIDTH = 14;
const TINT_ALPHA = 0.9;
// Fraction of the head diameter, from the top, over which the tint fades out.
const TINT_FADE_FRACTION = 0.55;
const TINT_BANDS = 12;

// Shiver marks as offsets from the head centre (source pixels), two per side.
const SHIVER_MARKS: readonly (readonly (readonly [number, number])[])[] = [
  [[-122, -40], [-138, -18], [-116, 0], [-136, 22]],
  [[-120, 57], [-90, 76], [-120, 80], [-88, 98]],
  [[135, -24], [152, -3], [132, 9], [152, 28]],
  [[130, 54], [114, 72], [134, 82], [116, 98]],
];

export interface ColdTintBand {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
}

export interface ColdOverlayShapes {
  readonly head: HeadCircle;
  readonly tintBands: readonly ColdTintBand[];
  readonly marks: readonly (readonly { readonly x: number; readonly y: number }[])[];
}

export function computeColdOverlay(direction: HumanWalkDirection): ColdOverlayShapes {
  const head = HEADS[direction];
  const fadeHeight = head.r * 2 * TINT_FADE_FRACTION;
  const bandHeight = fadeHeight / TINT_BANDS;
  const top = head.cy - head.r;
  const tintBands = Array.from({ length: TINT_BANDS }, (_, index): ColdTintBand => {
    const bandTop = top + index * bandHeight;
    // Use the band's narrower edge so the rectangle stays inside the circle.
    const dy = Math.max(Math.abs(bandTop - head.cy), Math.abs(bandTop + bandHeight - head.cy));
    const halfWidth = Math.sqrt(Math.max(0, head.r * head.r - dy * dy));
    return {
      left: head.cx - halfWidth,
      top: bandTop,
      width: halfWidth * 2,
      height: bandHeight,
      alpha: TINT_ALPHA * (1 - (index + 0.5) / TINT_BANDS) ** 1.2,
    };
  });
  const marks = SHIVER_MARKS.map((points) =>
    points.map(([dx, dy]) => ({ x: head.cx + dx, y: head.cy + dy })),
  );
  return { head, tintBands, marks };
}
