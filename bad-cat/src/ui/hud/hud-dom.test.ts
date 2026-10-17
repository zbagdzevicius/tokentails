// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { DEFAULT_CAT, HumanSt, NOISE, type SimState } from '../../types';
import { sim } from '../../sim';
import { makeBossRoom, makeRoom } from '../../sim/fixtures';
import { createHud } from '../screens/Hud';

const opts = (play: ReturnType<typeof makeRoom>) => ({
  play,
  ftue: false,
  touch: true,
  practice: false,
  onPause: () => undefined,
  onResume: () => undefined,
  onQuit: () => undefined,
  onRestart: () => undefined,
});

describe('HUD v5 (DOM)', () => {
  it('eye floats above the projected human; falls back to the corner when the projection is missing or off screen', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const play = makeRoom();
    const hud = createHud(host, opts(play));
    const s = sim.initSim(play, DEFAULT_CAT);
    const eye = host.querySelector('.bc-eye') as HTMLElement;
    const float = host.querySelector('.bc-float') as HTMLElement;
    hud.update(s, []);
    expect(float.classList.contains('is-on')).toBe(false);
    expect(eye.classList.contains('is-away')).toBe(false);
    let p: { x: number; y: number; onScreen: boolean } | null = { x: 0.6, y: 0.4, onScreen: true };
    hud.setProjector?.({ human: () => p });
    hud.update(s, []);
    expect(float.classList.contains('is-on')).toBe(true);
    expect(float.style.transform).toContain('translate3d(');
    expect(eye.classList.contains('is-away')).toBe(true);
    p = { x: 0.6, y: 0.4, onScreen: false };
    hud.update(s, []);
    expect(float.classList.contains('is-on')).toBe(false);
    expect(eye.classList.contains('is-away')).toBe(false);
    // projectHuman missing → projectWorld of the head cell
    hud.setProjector?.({ world: () => ({ x: 0.3, y: 0.5, onScreen: true }) });
    hud.update(s, []);
    expect(float.classList.contains('is-on')).toBe(true);
    hud.dispose();
    expect(host.querySelector('.bc-float')).toBeNull();
  });

  it('Sunday: the Zzz bar replaces the eye while she sleeps and pulses at 75 %', () => {
    const host = document.createElement('div');
    const play = makeBossRoom({ napper: true });
    const hud = createHud(host, opts(play));
    const s = sim.initSim(play, DEFAULT_CAT);
    hud.update(s, []);
    const noise = host.querySelector('.bc-noise') as HTMLElement;
    const eye = host.querySelector('.bc-eye') as HTMLElement;
    expect(noise.classList.contains('is-on')).toBe(true);
    expect(eye.classList.contains('is-gone')).toBe(true);
    const loud = { ...s, noise: (NOISE.max * 80) / 100 } as SimState;
    hud.update(loud, [{ t: 'noise', tick: 1, level: 75_000 }]);
    expect(noise.classList.contains('is-pulse')).toBe(true);
    expect((host.querySelector('.bc-noise-fill') as HTMLElement).style.transform).toBe('scaleX(0.8)');
    expect(host.querySelector('.bc-cue-noise')!.textContent).toContain('stirring');
    const look = { ...s, humans: s.humans.map((h) => ({ ...h, state: HumanSt.LOOK })) } as SimState;
    hud.update(look, [{ t: 'wake', tick: 2, human: 0 }]);
    expect(noise.classList.contains('is-on')).toBe(false);
    expect(eye.classList.contains('is-gone')).toBe(false);
    expect([...host.querySelectorAll('.bc-sticker')].some((e) => e.textContent === "SHE'S AWAKE!")).toBe(true);
    hud.dispose();
  });

  it('two humans: pips in the eye; ghost chips with a replay-only tag; event banner sub line', () => {
    const host = document.createElement('div');
    const play = makeBossRoom();
    const hud = createHud(host, opts(play));
    const s = sim.initSim(play, DEFAULT_CAT);
    expect(s.humans.length).toBe(2);
    const g = sim.initSim(play, DEFAULT_CAT, { simVersion: 4 });
    g.score = 4210;
    hud.setGhosts?.([{ name: 'Mochi', replayOnly: false, state: g }, { name: 'Oldie', replayOnly: true, state: g }]);
    const two = { ...s, eventActive: 1, humans: [{ ...s.humans[0], state: HumanSt.BUSY }, { ...s.humans[1], state: HumanSt.TELEGRAPH }] } as SimState;
    hud.update(two, []);
    expect(host.querySelector('.bc-pips.is-on')).not.toBeNull();
    expect([...host.querySelectorAll('.bc-pip')].map((e) => e.textContent).slice(0, 2)).toEqual(['', '?']);
    const chips = [...host.querySelectorAll('.bc-ghost')];
    expect(chips[0].querySelector('.bc-ghost-name')!.textContent).toBe('Mochi 4,210');
    expect(chips[0].classList.contains('is-behind')).toBe(true);
    expect(chips[1].querySelector('.bc-ghost-tag')!.textContent).toBe('replay only (older version)');
    expect(chips[1].classList.contains('is-behind')).toBe(false);
    expect(host.querySelector('.bc-banner-title')!.textContent).toMatch(/ \d+ seconds?$/);
    expect(host.querySelector('.bc-banner-sub')!.textContent!.length).toBeGreaterThan(5);
    expect(host.querySelector('.bc-banner-run')!.getAttribute('aria-label')).toContain(host.querySelector('.bc-banner-sub')!.textContent!);
    hud.dispose();
  });

  it('crime stickers come from a pool (no DOM growth)', () => {
    const host = document.createElement('div');
    const play = makeRoom();
    const hud = createHud(host, opts(play));
    const s = sim.initSim(play, DEFAULT_CAT);
    const before = host.querySelectorAll('*').length;
    for (let i = 0; i < 40; i++) hud.update({ ...s, tick: i } as SimState, [{ t: 'slide', tick: i, fromX: 1, fromZ: 1, x: 2, z: 1 }, { t: 'topple', tick: i, prop: 0, cells: 3, dir: 2 }]);
    expect(host.querySelectorAll('*').length).toBe(before);
    expect([...host.querySelectorAll('.bc-sticker')].some((e) => e.textContent === 'TIMBER!')).toBe(true);
    hud.dispose();
  });
});
