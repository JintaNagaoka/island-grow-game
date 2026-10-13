import type { SliceSnapshot } from '../game/sliceGame';
import {
  hasDomesticLivestockFamily,
  hasDryRiverbed,
  hasLivestockFacilities,
  hasMatureFarm,
  hasPracticalCave,
  hasSecondDwelling,
  hasStoneWorkshop,
} from '../game/worldState';
import { clamp01, easeOutBack, levelUpBlend } from './animation';
import {
  TURN3_ACTION_ANIMATIONS,
  TURN3_ACTION_FRAMES,
  type Turn3ActionId,
  type Turn3Asset,
} from './turn3Assets';

export interface Turn3PropVisual {
  readonly alpha: number;
  readonly scale: number;
}

const HIDDEN: Turn3PropVisual = { alpha: 0, scale: 1 };
const SHOWN: Turn3PropVisual = { alpha: 1, scale: 1 };

const reveal = (progress: number, start = 0): Turn3PropVisual => {
  const local = clamp01((progress - start) / Math.max(0.01, 1 - start));
  return { alpha: clamp01(local * 2), scale: 0.82 + 0.18 * easeOutBack(local) };
};

export function computeTurn3Props(snapshot: SliceSnapshot): Record<
  'matureFarm' | 'secondHut' | 'stoneWorkshop' | 'practicalCave' | 'dryRiverbed' |
  'livestockParent' | 'livestockChild' | 'fence' | 'feedTrough' | 'waterTrough',
  Turn3PropVisual
> {
  const wave = snapshot.activeWave;
  const settlement = wave?.id === 'settlement-expands' ? wave : null;
  const livestock = wave?.id === 'livestock-domesticated' ? wave : null;
  const workshop = wave?.id === 'stone-workshop-built' ? wave : null;
  const settled = {
    matureFarm: hasMatureFarm(snapshot.world),
    secondHut: hasSecondDwelling(snapshot.world),
    practicalCave: hasPracticalCave(snapshot.world),
    dryRiverbed: hasDryRiverbed(snapshot.world),
  };
  const domestic = hasDomesticLivestockFamily(snapshot.world);
  const facilities = hasLivestockFacilities(snapshot.world);
  return {
    stoneWorkshop: workshop ? reveal(workshop.progress) : hasStoneWorkshop(snapshot.world) ? SHOWN : HIDDEN,
    matureFarm: settlement ? reveal(settlement.progress, 0) : settled.matureFarm ? SHOWN : HIDDEN,
    secondHut: settlement ? reveal(settlement.progress, 0.12) : settled.secondHut ? SHOWN : HIDDEN,
    practicalCave: settlement ? reveal(settlement.progress, 0.25) : settled.practicalCave ? SHOWN : HIDDEN,
    dryRiverbed: settlement ? reveal(settlement.progress, 0.38) : settled.dryRiverbed ? SHOWN : HIDDEN,
    fence: livestock ? reveal(livestock.progress, 0) : facilities ? SHOWN : HIDDEN,
    feedTrough: livestock ? reveal(livestock.progress, 0.16) : facilities ? SHOWN : HIDDEN,
    waterTrough: livestock ? reveal(livestock.progress, 0.26) : facilities ? SHOWN : HIDDEN,
    livestockParent: livestock ? reveal(livestock.progress, 0.36) : domestic ? SHOWN : HIDDEN,
    livestockChild: livestock ? reveal(livestock.progress, 0.5) : domestic ? SHOWN : HIDDEN,
  };
}

export interface Turn3ActionVisual {
  readonly action: Turn3ActionId;
  readonly frame: Turn3Asset;
  readonly alpha: number;
}

export function computeTurn3Action(snapshot: SliceSnapshot): Turn3ActionVisual | null {
  const wave = snapshot.activeWave;
  const action: Turn3ActionId | null =
    wave?.id === 'human-gathers-stone' ? 'gather' :
      wave?.id === 'stone-workshop-built' ? 'build' :
        wave?.id === 'settlement-expands' || wave?.id === 'livestock-domesticated' ? 'carry' : null;
  if (action === null || wave === null) return null;
  const frames = TURN3_ACTION_FRAMES[action];
  const index = Math.floor(wave.elapsedMs / TURN3_ACTION_ANIMATIONS.frameDurationMs) % frames.length;
  const fade = levelUpBlend(clamp01(wave.progress / 0.12)).newAlpha;
  return { action, frame: frames[index], alpha: fade };
}
