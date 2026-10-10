export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  // 8-bit RGBA, row-major.
  readonly pixels: Uint8Array;
}
export interface BackgroundRule {
  readonly maxChroma: number;
  readonly minLuma: number;
  readonly maxLuma: number;
  readonly paleBlue?: {
    readonly maxChroma: number;
    readonly minBlueLead: number;
    readonly minLuma: number;
    readonly maxLuma: number;
  };
}
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
export const BACKGROUND_RULE: BackgroundRule;
export function removeExteriorBackground(image: RgbaImage, rule?: BackgroundRule): RgbaImage;
export function removeSpeckles(image: RgbaImage, maxArea: number): RgbaImage;
export function opaqueBounds(image: RgbaImage, padding?: number): Rect;
export function crop(image: RgbaImage, rect: Rect): RgbaImage;
export function resizeArea(image: RgbaImage, width: number, height: number): RgbaImage;
export function peelGrayRim(
  image: RgbaImage,
  options?: {
    passes?: number;
    maxChroma?: number;
    minLuma?: number;
    maxLuma?: number;
    minTransparentNeighbors?: number;
  },
): RgbaImage;
