import type { SliceSnapshot } from '../game/sliceGame';
import { FIRST_RESIDENT_ID, SECOND_RESIDENT_ID, type Resident } from '../game/worldState';
import { clamp01, computeHumanPose, easeOutBack, type HumanPose } from './animation';
import { computeCrewVisuals, computeFounderVisual, type CrewLayers } from './crew';
import { LAYOUT } from './layout';
import { computeLifeHuman } from './lifeAnimation';

// Per-resident visuals derived from the authoritative snapshot (WorldState.residents)
// and the logical clock. Nothing here creates, removes or moves a resident in game
// state: the population split is game state (splitResident), the split presentation
// is the progress of the 'human-splits' Wave (its length is SPLIT_WAVE_MS in
// game/timing.ts, a provisional Human Review value), and this only draws what the
// snapshot holds, so repeated evaluation can never add a resident.

// Fraction of the split Wave spent on the shake (ぷるぷる) before the pop (ポンッ).
const SPLIT_SHAKE_END = 0.5;
const SPLIT_SHAKE_AMPLITUDE_PX = 2.5;
const SPLIT_SHAKE_HZ = 9;

export interface ResidentVisual {
  readonly id: string;
  readonly pose: HumanPose;
  readonly alpha: number;
  // Whole-sprite scale multiplier on top of the shared Human scale (split squash/pop).
  readonly scale: number;
  // Horizontal shake offset in design pixels.
  readonly shakeX: number;
  // The work effect drawn as its own layer beside the human `pose`. Composite action
  // frames may bake in a tool or load; buildings and world state remain separate.
  // Absent for a resident who raises no effect.
  readonly layers?: CrewLayers;
}

export interface SplitEffect {
  readonly ground: { readonly x: number; readonly y: number };
  readonly glow: number;
  readonly sparkle: number;
}

// 0..1 progress of the split level-up, or null outside a split Wave: 'human-splits'
// (Turn 2, the second resident) or 'human-divides' (Turn 3, the third). Both shake the
// first resident, then a new one pops out beside them at the fire.
function splitProgress(snapshot: SliceSnapshot): number | null {
  const wave = snapshot.activeWave;
  return wave?.id === 'human-splits' || wave?.id === 'human-divides' ? clamp01(wave.progress) : null;
}

// A resident working or walking toward the plot follows the Turn 2 route/farm art;
// one that waits at the fire keeps the Turn 1 completed pose.
const isFarmResident = (resident: Resident): boolean =>
  resident.place === 'plot' || resident.target === 'plot';

export function computeResidentVisuals(snapshot: SliceSnapshot): readonly ResidentVisual[] {
  const split = splitProgress(snapshot);
  const clockSeconds = snapshot.clockMs / 1000;
  // Residents 1 and 2 keep the approved Turn 1/2 behaviour; residents 3 to 6 (Turn 3 and
  // Turn 4) are drawn by crew.ts, including the ones whose arrival Wave is playing.
  const founders = snapshot.world.residents.filter(
    (resident) => resident.id === FIRST_RESIDENT_ID || resident.id === SECOND_RESIDENT_ID,
  );
  const visuals = founders.map((resident, index): ResidentVisual => {
    // From Turn 3 a founder can have autonomous work (a Wave routine, a role in the village, or
    // a place away from the Turn 2 post): crew.ts then draws them, as one resident only once.
    const working = computeFounderVisual(snapshot, resident);
    if (working !== null) return working;
    if (!isFarmResident(resident)) {
      // At the fire: the Turn 1 completed pose. During the split every resident
      // shares this exact ground point; only the original shakes and the new pops.
      const pose = computeHumanPose(snapshot);
      let alpha = 1;
      let scale = 1;
      let shakeX = 0;
      if (split !== null && index === 0) {
        if (split < SPLIT_SHAKE_END) {
          const ramp = split / SPLIT_SHAKE_END;
          shakeX = Math.sin(clockSeconds * Math.PI * 2 * SPLIT_SHAKE_HZ) * SPLIT_SHAKE_AMPLITUDE_PX * ramp;
          scale = 1 + 0.04 * ramp;
        } else {
          scale = 1.04 - 0.04 * easeOutBack((split - SPLIT_SHAKE_END) / (1 - SPLIT_SHAKE_END));
        }
      } else if (split !== null) {
        // The new resident pops out only after the shake; before that it is not drawn.
        if (split < SPLIT_SHAKE_END) alpha = 0;
        else scale = 0.6 + 0.4 * easeOutBack((split - SPLIT_SHAKE_END) / (1 - SPLIT_SHAKE_END));
      }
      return { id: resident.id, pose, alpha, scale, shakeX };
    }

    const life = computeLifeHuman(snapshot);
    return {
      id: resident.id,
      pose: life?.pose ?? computeHumanPose(snapshot),
      alpha: life?.alpha ?? 0,
      scale: 1,
      shakeX: 0,
    };
  });
  return [...visuals, ...computeCrewVisuals(snapshot)];
}

// The warm glow and sparkles of the split, at the Turn 1 completed position.
export function computeSplitEffect(snapshot: SliceSnapshot): SplitEffect | null {
  const split = splitProgress(snapshot);
  if (split === null) return null;
  return { ground: LAYOUT.humanWarm, glow: Math.sin(Math.PI * split), sparkle: split };
}
