// @vitest-environment happy-dom
/**
 * F13 (ITERATION-4.md): one-tap menu tiles. The setup of each mode (racer, class, cup or track, Wild Card) is
 * remembered per mode; a mode never raced opens its pickers; a remembered one starts in one tap.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { save } from '../core/app/save';
import { Modifier } from '../types';
import { ModesFlow } from './flow';
import { modesSlot } from './store';
import { setUnlockProvider } from './hooks';
import type { Shell } from '../core/app/shell';

function stubShell() {
  const startRace = vi.fn((_req: Record<string, unknown>) => new Promise<{ exit: string }>(() => {}));
  const shell = {
    bus: { add() {} },
    host: document.createElement('div'),
    updateSettings: vi.fn(),
    startRace,
    start: vi.fn(),
    hudExtras: vi.fn(),
    leaveRace: vi.fn(),
    world: null,
    attract: false,
  };
  return { shell: shell as unknown as Shell, startRace };
}

describe('F13 one-tap tiles: the setup remembered per mode', () => {
  beforeEach(() => {
    localStorage.clear();
    save.reset();
    // everything open (the unlock rules have their own tests)
    setUnlockProvider({ lock: () => null, shelterCats: () => [] } as never);
  });

  it('a mode never raced opens its pickers; after one start the tile starts it in one tap', () => {
    const { shell, startRace } = stubShell();
    const f = new ModesFlow(shell);
    expect(f.oneTap('race')).toBe(false);
    expect(f.oneTap('gp')).toBe(false);
    f.startQuick('rooftops', 1, 'box-party');
    expect(startRace).toHaveBeenCalledTimes(1);
    expect(startRace.mock.calls[0][0]).toMatchObject({ cls: 1, modifiers: Modifier.BoxParty, mode: 'race' });
    expect(modesSlot().get().memo.race.set).toBe(true);
    // the other modes are untouched
    expect(modesSlot().get().memo.gp.set).toBe(false);
    expect(f.tileSetup('race').line).toContain('Neon Rooftops');
    expect(f.oneTap('race')).toBe(true);
    expect(startRace).toHaveBeenCalledTimes(2);
    const again = startRace.mock.calls[1][0] as { track: { id: string }; cls: number; modifiers: number };
    expect([again.track.id, again.cls, again.modifiers]).toEqual(['rooftops', 1, Modifier.BoxParty]);
  });

  it('remembers the racer per mode', () => {
    const { shell } = stubShell();
    const f = new ModesFlow(shell);
    f.setLook((l) => (l.cat = 'tofu'));
    f.startQuick('kitchen', 0, 'none');
    expect(modesSlot().get().memo.race.cat).toBe('tofu');
    expect(f.modeCat('race')).toBe('tofu');
    // a remembered racer the player no longer has (a Pink Paw cat after a reset) falls back to the current one
    modesSlot().update((s) => (s.memo.gp = { cat: 'gone-cat', set: true }));
    expect(f.modeCat('gp')).toBe(f.look.cat);
  });

  it('a Grand Prix tile starts the remembered cup and class at once', () => {
    const { shell, startRace } = stubShell();
    const f = new ModesFlow(shell);
    f.startCup('kibble', 1);
    expect(startRace).toHaveBeenCalledTimes(1);
    f.dropCup();
    expect(f.tileSetup('gp').line).toMatch(/Kibble Cup · 100cc/);
    expect(f.oneTap('gp')).toBe(true);
    expect(startRace).toHaveBeenCalledTimes(2);
    expect(startRace.mock.calls[1][0]).toMatchObject({ mode: 'gp', cupId: 'kibble', cls: 1, raceIndex: 0 });
  });

  it('"Surprise me" deals one mutator the class allows at each start', () => {
    const { shell, startRace } = stubShell();
    const f = new ModesFlow(shell);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      f.startQuick('kitchen', 0, 'surprise');
      const m = (startRace.mock.calls.at(-1)![0] as { modifiers: number }).modifiers;
      expect(m).not.toBe(0);
      expect(m & (m - 1)).toBe(0); // exactly one bit
      seen.add(m);
    }
    expect(seen.size).toBeGreaterThan(2);
    expect(modesSlot().get().last.quickWild).toBe('surprise');
  });
});
