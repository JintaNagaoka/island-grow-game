import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Boundary checks for the state-authority rules in AGENTS.md: the Rule Engine knows
// nothing of Waves, timing, animation or Phaser; Waves and Presentation never reach
// into the Rule Engine; and nothing in the engine reads a real clock or randomness.

const GAME = new URL('./', import.meta.url);
const PRESENTATION = new URL('../presentation/', import.meta.url);
const sources = (dir: URL, test = false): { name: string; text: string }[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && name.endsWith('.test.ts') === test)
    .map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') }));
const code = (text: string): string => text.replace(/\/\/.*$/gm, '');
const imports = (text: string): string[] => [...text.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

describe('state authority boundaries', () => {
  const rules = sources(new URL('rules/', GAME));

  it('keeps the Rule Engine free of Waves, timing, rendering and Phaser', () => {
    expect(rules.map((file) => file.name).sort()).toEqual(['catalog.ts', 'engine.ts', 'state.ts']);
    for (const { name, text } of rules) {
      for (const path of imports(text)) {
        expect(['./catalog', './engine', './state', '../worldState'], `${name} imports ${path}`).toContain(path);
      }
      // Only types may come from worldState (the Element union).
      const world = text.match(/import[^;]*from '\.\.\/worldState';/g) ?? [];
      for (const statement of world) expect(statement, name).toMatch(/import type|import \{ type /);
    }
  });

  it('reads no real clock, timer or randomness anywhere in the Rule Engine', () => {
    for (const { name, text } of rules) {
      for (const forbidden of ['Date.now', 'new Date', 'Math.random', 'performance.', 'setTimeout', 'setInterval', 'requestAnimationFrame']) {
        expect(text.includes(forbidden), `${name} uses ${forbidden}`).toBe(false);
      }
    }
  });

  it('never lets a Wave reach the authoritative state', () => {
    const waves = code(readFileSync(new URL('waves.ts', GAME), 'utf8'));
    expect(imports(waves).some((path) => path.includes('rules'))).toBe(false);
    expect(waves.includes('RuleState')).toBe(false);
  });

  it('has the Rule Engine decide TRUE and the END from state, not the other way round', () => {
    const catalog = code(readFileSync(new URL('rules/catalog.ts', GAME), 'utf8'));
    // No Rule is keyed by an END name or reads the ending; the only route knowledge is in judgement.
    for (const forbidden of ['ending', "'true'", "'secret'", 'TRUE_ROUTE', 'isExactTrueRoute']) {
      expect(catalog.includes(forbidden), `catalog mentions ${forbidden}`).toBe(false);
    }
  });

  it('keeps every causal rule on state: no rule reads the order elements were selected in', () => {
    const catalog = code(readFileSync(new URL('rules/catalog.ts', GAME), 'utf8'));
    // Relative order may classify END axes (engine.ts); rules read Stages, Flags and the
    // crack / root state. Only elapsed time (ageOf) may look at when an element arrived.
    for (const forbidden of ['justSelected', 'selectedElements.slice', 'selectedElements.includes', 'selectedElements.at', 'selectedElements.join']) {
      expect(catalog.includes(forbidden), `catalog reads ${forbidden}`).toBe(false);
    }
    const state = code(readFileSync(new URL('rules/state.ts', GAME), 'utf8'));
    for (const forbidden of ['boulderAnchored', 'crackExposed', 'rootIntoRuins']) {
      expect(state.includes(forbidden) || catalog.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('keeps Presentation reading the snapshot only: it never imports the Rule Engine or Wave catalogs’ effects', () => {
    for (const { name, text } of sources(PRESENTATION)) {
      expect(imports(text).some((path) => path.includes('game/rules')), `${name} imports the Rule Engine`).toBe(false);
    }
  });
});
