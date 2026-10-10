import type { RgbaImage } from './worldAssetPixels.mjs';

export function decodePng(bytes: Uint8Array): RgbaImage;
export function encodePng(image: RgbaImage): Uint8Array;
