export const HUMAN_POSES = [
  'idle',
  'notice',
  'rise',
  'walk1',
  'walk2',
  'warm',
  'cold',
] as const;

export type HumanAnimationState = (typeof HUMAN_POSES)[number];
export type HumanAssetVariant = 'normal' | 'isCold';

export interface HumanAssetMetadata {
  readonly textureKey: string;
  readonly filename: string;
  readonly animationState: HumanAnimationState;
  readonly variant: HumanAssetVariant;
  readonly groundAnchorX: number;
  readonly groundAnchorY: number;
}

type HumanAssetVariants = Readonly<Record<HumanAssetVariant, HumanAssetMetadata>>;

function asset(
  animationState: HumanAnimationState,
  variant: HumanAssetVariant,
  groundAnchorX: number,
  groundAnchorY: number,
): HumanAssetMetadata {
  const textureKey = variant === 'isCold' ? `${animationState}_isCold` : animationState;
  return {
    textureKey,
    filename: `${textureKey}.png`,
    animationState,
    variant,
    groundAnchorX,
    groundAnchorY,
  };
}

// Presentation-only source-pixel metadata. Anchors are the rounded mean X and
// maximum Y of the character body's ground-contact pixels at alpha >= 50%;
// disconnected notice/motion/shiver marks are excluded from the body mask.
export const HUMAN_ASSETS: Readonly<Record<HumanAnimationState, HumanAssetVariants>> = {
  idle: {
    normal: asset('idle', 'normal', 255, 479),
    isCold: asset('idle', 'isCold', 254, 481),
  },
  notice: {
    normal: asset('notice', 'normal', 248, 484),
    isCold: asset('notice', 'isCold', 248, 485),
  },
  rise: {
    normal: asset('rise', 'normal', 206, 429),
    isCold: asset('rise', 'isCold', 206, 430),
  },
  walk1: {
    normal: asset('walk1', 'normal', 204, 479),
    isCold: asset('walk1', 'isCold', 205, 480),
  },
  walk2: {
    normal: asset('walk2', 'normal', 356, 476),
    isCold: asset('walk2', 'isCold', 354, 476),
  },
  warm: {
    normal: asset('warm', 'normal', 220, 448),
    isCold: asset('warm', 'isCold', 220, 449),
  },
  cold: {
    normal: asset('cold', 'normal', 251, 462),
    isCold: asset('cold', 'isCold', 250, 462),
  },
};

export const HUMAN_ASSET_LIST: readonly HumanAssetMetadata[] = HUMAN_POSES.flatMap((pose) => [
  HUMAN_ASSETS[pose].normal,
  HUMAN_ASSETS[pose].isCold,
]);

export function selectHumanAsset(
  animationState: HumanAnimationState,
  isCold: boolean,
): HumanAssetMetadata {
  return HUMAN_ASSETS[animationState][isCold ? 'isCold' : 'normal'];
}

// Every approved human PNG is a 512x512 canvas.
export const HUMAN_FRAME_SIZE = 512;

// Sprite origin (0..1) that puts the asset's ground anchor on the sprite's
// ground position.
export function humanAssetOrigin(metadata: HumanAssetMetadata): { x: number; y: number } {
  return {
    x: metadata.groundAnchorX / HUMAN_FRAME_SIZE,
    y: metadata.groundAnchorY / HUMAN_FRAME_SIZE,
  };
}

// Approved four-direction walk (human-walk-4dir-approved-v1). The 12 canonical
// PNGs are base-body frames only: they carry no cold variant, and the left PNGs
// are supplied directly, so nothing here is ever flipped at runtime. Timing and
// movement live in humanWalk.ts; this registry is only asset identity.
export const HUMAN_WALK_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export const HUMAN_WALK_POSES = ['step-a', 'stand', 'step-b'] as const;

export type HumanWalkDirection = (typeof HUMAN_WALK_DIRECTIONS)[number];
export type HumanWalkPose = (typeof HUMAN_WALK_POSES)[number];
export type HumanWalkTextureKey = `human-walk-${HumanWalkDirection}-${HumanWalkPose}`;

export const HUMAN_WALK_FRAME_SIZE = HUMAN_FRAME_SIZE;
// Shared origin of every walk frame: pixel (256, 466) of the 512x512 canvas.
export const HUMAN_WALK_ORIGIN = { x: 0.5, y: 0.91015625 } as const;

export interface HumanWalkAssetMetadata {
  readonly textureKey: HumanWalkTextureKey;
  // Relative to /assets/human/.
  readonly filename: string;
  readonly direction: HumanWalkDirection;
  readonly pose: HumanWalkPose;
}

export function humanWalkTextureKey(
  direction: HumanWalkDirection,
  pose: HumanWalkPose,
): HumanWalkTextureKey {
  return `human-walk-${direction}-${pose}`;
}

export const HUMAN_WALK_ASSET_LIST: readonly HumanWalkAssetMetadata[] =
  HUMAN_WALK_DIRECTIONS.flatMap((direction) =>
    HUMAN_WALK_POSES.map((pose) => {
      const textureKey = humanWalkTextureKey(direction, pose);
      return { textureKey, filename: `walk/${textureKey}.png`, direction, pose };
    }),
  );

export function selectHumanWalkAsset(
  direction: HumanWalkDirection,
  pose: HumanWalkPose,
): HumanWalkAssetMetadata {
  const textureKey = humanWalkTextureKey(direction, pose);
  const metadata = HUMAN_WALK_ASSET_LIST.find((asset) => asset.textureKey === textureKey);
  if (!metadata) throw new RangeError(`unknown human walk asset: ${textureKey}`);
  return metadata;
}

export interface HumanWalkPresentation {
  readonly asset: HumanWalkAssetMetadata;
  // The walk art has no cold variant, so the existing cold presentation is
  // layered on top. WorldState.isCold is its only source of truth; direction
  // and pose never influence it.
  readonly coldOverlay: boolean;
}

export function selectHumanWalkPresentation(
  direction: HumanWalkDirection,
  pose: HumanWalkPose,
  isCold: boolean,
): HumanWalkPresentation {
  return { asset: selectHumanWalkAsset(direction, pose), coldOverlay: isCold };
}
