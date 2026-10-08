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
