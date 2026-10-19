import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { KartState, RaceState } from '../../types';
import { arrowAngle, incomingItems, type Incoming } from './incoming';
import { fmtClock, fmtDelta, ordinalSuffix, ordinalText } from './hud';
import { CORE_EN } from '../../ui/strings/core.en';
import { registerStrings, setLocale } from '../../ui/i18n';
import { TIER_COLOURS } from '../../ui/a11y';
import type { Colourblind } from '../app/save';
import { sceneFor } from '../../ui/install';
import { wantsWipe } from '../../ui/transitions';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..');

function kart(p: Partial<KartState>): KartState {
  return { x: 0, z: 0, vx: 0, vz: 0, finished: 0 } as KartState & typeof p;
}

function state(karts: Array<Partial<KartState>>, proj: unknown[]): RaceState {
  return { karts: karts.map((k) => ({ ...kart(k), ...k })), items: { s: { proj, traps: [] } } } as unknown as RaceState;
}

describe('incoming items', () => {
  const out: Incoming[] = [];
  it('a homing yarn ball locked on the player is incoming, nearest first', () => {
    // player at z=20 driving +z at 20 m/s; a yarn ball 30 m behind homing at 32 m/s; another kart's laser far away
    const st = state(
      [{ x: 0, z: 20, vz: 20 }, { x: 0, z: -10 }],
      [
        { kind: 1, owner: 1, x: 0, z: -10, vx: 0, vz: 32, target: 0 },
        { kind: 2, owner: 1, x: 0, z: -60, vx: 0, vz: 40, target: 0 },
      ],
    );
    const list = incomingItems(st, 0, out);
    expect(list).toHaveLength(1);
    expect(list[0].item).toBe('yarn');
    expect(list[0].eta).toBeCloseTo(30 / 12, 1);
  });
  it('a hairball counts only when it points at the player and closes in', () => {
    const at = state([{ x: 0, z: 10, vz: 5 }, {}], [{ kind: 0, owner: 1, x: 0, z: 0, vx: 0, vz: 30, target: -1 }]);
    expect(incomingItems(at, 0, out)).toHaveLength(1);
    const away = state([{ x: 0, z: 10, vz: 5 }, {}], [{ kind: 0, owner: 1, x: 0, z: 0, vx: 0, vz: -30, target: -1 }]);
    expect(incomingItems(away, 0, out)).toHaveLength(0);
    const wide = state([{ x: 0, z: 10, vz: 5 }, {}], [{ kind: 0, owner: 1, x: 0, z: 0, vx: 30, vz: 10, target: -1 }]);
    expect(incomingItems(wide, 0, out)).toHaveLength(0);
    // the player's own shot never warns them
    const own = state([{ x: 0, z: 10, vz: 5 }], [{ kind: 0, owner: 0, x: 0, z: 0, vx: 0, vz: 30, target: -1 }]);
    expect(incomingItems(own, 0, out)).toHaveLength(0);
  });
  it('no items slot, a finished player or nothing in range means nothing incoming', () => {
    expect(incomingItems({ karts: [kart({})], items: {} } as unknown as RaceState, 0, out)).toHaveLength(0);
    const done = state([{ x: 0, z: 10, finished: 1 }, {}], [{ kind: 1, owner: 1, x: 0, z: 0, vx: 0, vz: 30, target: 0 }]);
    expect(incomingItems(done, 0, out)).toHaveLength(0);
  });
  it('edge arrows: ahead is up, behind is down, right is right', () => {
    // camera at the origin looking along +z (heading 0)
    expect(arrowAngle(0, 0, 0, 1, 0, 10)).toBeCloseTo(0);
    expect(Math.abs(arrowAngle(0, 0, 0, 1, 0, -10))).toBeCloseTo(Math.PI);
    // a kart facing +z has its right at −x (engine.ts: right = (−cos h, sin h))
    expect(arrowAngle(0, 0, 0, 1, -10, 0)).toBeCloseTo(Math.PI / 2);
    expect(arrowAngle(0, 0, 0, 1, 10, 0)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('hud formatting', () => {
  it('split deltas and the battle clock', () => {
    expect(fmtDelta(-0.4211)).toBe('−0.42');
    expect(fmtDelta(1.3)).toBe('+1.30');
    expect(fmtClock(180)).toBe('3:00');
    expect(fmtClock(9.2)).toBe('0:10');
    expect(fmtClock(-1)).toBe('0:00');
  });
  it('ordinals go through t()', () => {
    registerStrings('en', CORE_EN);
    setLocale('en');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinalSuffix)).toEqual(['st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'st', 'nd', 'st']);
    expect(ordinalText(2)).toBe('2nd');
    setLocale('xx');
    expect(ordinalText(2)).toMatch(/^2⟦/);
    setLocale('en');
  });
});

describe('strings', () => {
  it('every t() key in the shell and the audio-ui files is in CORE_EN', () => {
    const files = ['core/app/shell.ts', 'core/hud/hud.ts', 'core/hud/results.ts', 'juice/index.ts', 'ui/race-ui.ts', 'ui/screens/settings.ts', 'ui/screens/howto.ts'];
    const missing: string[] = [];
    for (const f of files) {
      const s = readFileSync(join(src, f), 'utf8');
      for (const m of s.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
        const k = m[2].replace(/\\'/g, "'");
        if (!(k in CORE_EN)) missing.push(`${f}: ${k}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

// ---- colour-blind safety of the drift tier colours (Machado et al. 2009, severity 1.0, linear RGB) ----
const SIM: Record<Exclude<Colourblind, 'off'>, number[][]> = {
  prot: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deut: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  trit: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lab(rgbLin: number[]): number[] {
  const [r, g, b] = rgbLin.map((v) => Math.max(0, Math.min(1, v)));
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
function seen(hex: number, mode: Colourblind): number[] {
  const rgb = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => lin(v / 255));
  if (mode === 'off') return lab(rgb);
  const m = SIM[mode];
  return lab(m.map((row) => row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]));
}
const dE = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('colour-blind drift tier colours', () => {
  it('each set keeps its three tiers clearly apart for the eyes it is made for', () => {
    for (const mode of ['off', 'deut', 'prot', 'trit'] as const) {
      const cols = TIER_COLOURS[mode];
      const viewers: Colourblind[] = mode === 'off' ? ['off'] : [mode];
      for (const v of viewers)
        for (let i = 0; i < 3; i++)
          for (let j = i + 1; j < 3; j++) expect(dE(seen(cols[i], v), seen(cols[j], v)), `${mode} tiers ${i}/${j} for ${v}`).toBeGreaterThan(25);
    }
  });
});

describe('screen flow look', () => {
  it('menus play the lounge loop, the podium its fanfare, races their song', () => {
    expect(sceneFor('menu', false, 'race')).toBe('menu');
    expect(sceneFor('title', true, 'race')).toBe('menu');
    expect(sceneFor('podium', false, 'menu')).toBe('podium');
    expect(sceneFor(null, true, 'menu')).toBe('race');
    expect(sceneFor('pause', true, 'race')).toBe('race');
    // settings from pause keeps the race; from the menu it keeps the menu loop
    expect(sceneFor('settings', true, 'race')).toBe('race');
    expect(sceneFor('settings', false, 'race')).toBe('menu');
    expect(sceneFor('standings', true, 'race')).toBe('race');
  });
  it('the paw iris plays on menu screens, never on pause or results', () => {
    expect(wantsWipe('menu', 'title')).toBe(true);
    expect(wantsWipe('settings', 'pause')).toBe(true);
    expect(wantsWipe('pause', null)).toBe(false);
    expect(wantsWipe('results', null)).toBe(false);
    expect(wantsWipe('menu', 'menu')).toBe(false);
  });
});
