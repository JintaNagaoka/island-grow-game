import type { SliceSnapshot } from '../game/sliceGame';
import { FIRE_WARMING_WAVES, PLANT_LIFE_WAVES, ROCK_WAVES, WATER_WAVES, type WaveId } from '../game/waves';
import { clamp01, levelUpBlend } from './animation';
import { PLANT_STAGES, type PlantStage } from './trueRouteAssets';

// The shared plant plot, derived from the visible world's revealed plant stage
// (WorldState.plantStage) and the active Wave's logical time. That stage is raised one
// Wave at a time by the Wave presenting the plant Event (farm-expands: plant-introduced and
// plant-tended, farm-matures: plant-fruits, farm-blossoms: plant-spreads,
// ecosystem-flourishes), so the plot shows each Stage the plant reaches in causal order, and
// never a Stage that has not been reached: nothing here reads the turn number, the END or
// the authoritative Stage. A Wave that raises the plant by several Stages passes through
// each of them in turn. Pure function of the snapshot: a global playback speed scales it.

const WAVES = [...FIRE_WARMING_WAVES, ...PLANT_LIFE_WAVES, ...ROCK_WAVES, ...WATER_WAVES];

// The plant stage the active Wave will have revealed when it completes (Wave.complete is the
// one place that raises it), or the current stage when no Wave is raising it.
function stageAfterWave(snapshot: SliceSnapshot): number {
  const { world, activeWave: wave } = snapshot;
  const definition = wave === null ? undefined : WAVES.find((candidate) => candidate.id === wave.id);
  return definition === undefined ? world.plantStage : Math.max(world.plantStage, definition.complete(world).plantStage);
}

// When, inside its Wave, the plot changes. The plant grows by the Rule Engine's Stage alone:
// no resident has to arrive, work or take any time first, so every Wave that raises the plant
// shows the change across its whole length. The one exception is Turn 2's first planting,
// where the plot takes over from the composite farm-work art (human + old plot) a moment into
// its Wave, so the two never show side by side.
const HAND_OVER_FRACTION = 0.1;
export function growthWindow(wave: { readonly id: WaveId; readonly durationMs: number }): { readonly fromMs: number; readonly toMs: number } {
  const fromMs = wave.id === 'farm-expands' ? HAND_OVER_FRACTION * wave.durationMs : 0;
  return { fromMs, toMs: wave.durationMs };
}

export interface PlantStageVisual {
  readonly stage: PlantStage;
  readonly alpha: number;
  // Multiplier on the frame's scale (the level-up swell), 1 when settled.
  readonly scale: number;
}

export interface PlantVisual {
  // Every stage frame, in stage order, alpha 0 for the ones that are not showing.
  readonly stages: readonly PlantStageVisual[];
  readonly glow: number;
  readonly sparkle: number | null;
}

const settled = (shown: number): PlantVisual => ({
  stages: PLANT_STAGES.map((stage) => ({ stage, alpha: stage === shown ? 1 : 0, scale: 1 })),
  glow: 0,
  sparkle: null,
});

export function computePlantVisual(snapshot: SliceSnapshot): PlantVisual {
  const { world, activeWave: wave } = snapshot;
  const prior = world.plantStage;
  const target = stageAfterWave(snapshot);
  if (wave === null || target === prior) return settled(prior);

  // The Wave raises the plant by `steps` stages, each shown for an equal share of the window.
  const steps = target - prior;
  const { fromMs, toMs } = growthWindow(wave);
  const progress = clamp01((wave.elapsedMs - fromMs) / Math.max(1, toMs - fromMs));
  const u = progress * steps;
  const index = Math.min(steps - 1, Math.floor(u));
  const t = u - index;
  const blend = levelUpBlend(t);
  const old = prior + index;
  const next = old + 1;
  return {
    stages: PLANT_STAGES.map((stage) => {
      if (stage === old) return { stage, alpha: blend.oldAlpha, scale: blend.oldScale };
      if (stage === next) return { stage, alpha: blend.newAlpha, scale: blend.newScale };
      return { stage, alpha: 0, scale: 1 };
    }),
    // A glow only while a stage is actually changing.
    glow: progress > 0 && progress < 1 ? blend.glow : 0,
    sparkle: progress > 0 && progress < 1 ? t : null,
  };
}
