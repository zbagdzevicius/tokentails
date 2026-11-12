// @vitest-environment happy-dom
/**
 * Founder ask 2026-11-12 ("on mobile make this a little bit bigger and show K/D/A as well"): the score plate shows the
 * own K / D / A in the clock tab, updates it on a change, and squeezes the phone strip in steps (scoreDense) so it
 * stays one line inside 248 px. The sizes themselves are checked in tests/e2e/scorebar.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { Hud, scoreDense, type StripLoad } from '../../src/ui/hud';
import { Scoreboard } from '../../src/ui/scoreboard';
import type { MatchClock } from '../../src/sim/api';

const CLOCK = (seconds: number): MatchClock => ({ tick: seconds * 30, seconds, phase: 'play', nextPhaseIn: 9000 }) as MatchClock;
const load = (o: Partial<StripLoad> = {}): StripLoad => ({ k0: 0, k1: 0, k: 0, d: 0, a: 0, clock: '1:01', obj: false, ping: false, ...o });

function mount(): { hud: Hud; plate: HTMLElement; kda: HTMLElement } {
  document.body.innerHTML = '<div class="pl-match"></div>';
  const hud = new Hud(document.querySelector('.pl-match') as HTMLElement, 'sage', 'pounce', { onSlot: () => undefined });
  return { hud, plate: document.querySelector<HTMLElement>('.pl-score')!, kda: document.querySelector<HTMLElement>('.pl-score .kda')! };
}

describe('scoreDense', () => {
  it('plain strip: everything shows', () => {
    expect(scoreDense(load())).toBe(0);
    expect(scoreDense(load({ k0: 9, k1: 9, k: 9, d: 9, a: 9, clock: '9:59' }))).toBe(0);
  });
  it('one or two extra digits (a 10+ count, a 10:00 clock) drop the "KDA" word', () => {
    expect(scoreDense(load({ k0: 12 }))).toBe(1);
    expect(scoreDense(load({ clock: '12:34', a: 10 }))).toBe(1);
  });
  it('the objective timer or many two-digit numbers: smaller digits, no swords', () => {
    expect(scoreDense(load({ obj: true }))).toBe(2);
    expect(scoreDense(load({ k0: 15, k1: 14, k: 12, d: 10, a: 15, clock: '25:00' }))).toBe(2);
  });
  it('the busiest strips (party ping chip, objective and two-digit numbers) drop the tower counts too', () => {
    expect(scoreDense(load({ ping: true, clock: '12:34' }))).toBe(3);
    expect(scoreDense(load({ obj: true, k0: 10, k1: 10, k: 10 }))).toBe(3);
  });
  it('small phones start at step 2 and go one step further (4 hides the objective timer)', () => {
    expect(scoreDense(load(), true)).toBe(2);
    expect(scoreDense(load({ k0: 12 }), true)).toBe(2);
    expect(scoreDense(load({ obj: true }), true)).toBe(3);
    expect(scoreDense(load({ ping: true, obj: true, clock: '25:00' }), true)).toBe(4);
  });
  it('negative or fractional input never throws or widens', () => {
    expect(scoreDense(load({ k: -1, d: 0.5 }))).toBe(0);
  });
});

describe('K / D / A on the score plate', () => {
  it('renders 0 / 0 / 0 in the clock tab, before the clock', () => {
    const { kda } = mount();
    expect(kda).not.toBeNull();
    expect(kda.parentElement?.classList.contains('mid')).toBe(true);
    expect(kda.nextElementSibling?.classList.contains('clock')).toBe(true);
    expect(kda.querySelector('.kk')?.textContent).toBe('0');
    expect(kda.querySelector('.kd')?.textContent).toBe('0');
    expect(kda.querySelector('.ka')?.textContent).toBe('0');
    expect(kda.getAttribute('aria-label')).toBe('Your K / D / A: 0 / 0 / 0');
  });

  it('updates on a change, and only then', () => {
    const { hud, kda } = mount();
    hud.kda(3, 1, 4);
    expect(kda.dataset.kda).toBe('3/1/4');
    expect(kda.querySelector('.kk')?.textContent).toBe('3');
    expect(kda.querySelector('.kd')?.textContent).toBe('1');
    expect(kda.querySelector('.ka')?.textContent).toBe('4');
    expect(kda.getAttribute('aria-label')).toBe('Your K / D / A: 3 / 1 / 4');
    const k = kda.querySelector('.kk')!;
    k.textContent = 'x';
    hud.kda(3, 1, 4);
    expect(k.textContent).toBe('x');
    hud.kda(4, 1, 4);
    expect(k.textContent).toBe('4');
  });

  it("the scoreboard's counts feed it (a knockout, an assist credit, a nap)", () => {
    const { hud, kda } = mount();
    const sb = new Scoreboard(document.body, ['sage', 'clem', 'brutus', 'sage', 'clem', 'brutus'], 1);
    sb.death(4, 1);
    sb.credit(1);
    sb.credit(1);
    sb.death(1, 3);
    hud.kda(sb.kills[1], sb.deaths[1], sb.assists(1));
    expect(kda.dataset.kda).toBe('1/1/1');
  });

  it('squeezes the plate from the score, the clock, the K / D / A and the objective timer', () => {
    const { hud, plate } = mount();
    hud.update(null, CLOCK(61), { kills: [0, 0], towers: [0, 0] }, 0);
    expect(plate.dataset.dense).toBe('0');
    hud.update(null, CLOCK(61), { kills: [12, 0], towers: [0, 0] }, 0);
    expect(plate.dataset.dense).toBe('1');
    hud.objective({ key: 'up', secs: 0 });
    expect(plate.dataset.dense).toBe('2');
    hud.kda(10, 10, 10);
    expect(plate.dataset.dense).toBe('3');
    hud.objective(null);
    hud.kda(0, 0, 0);
    hud.update(null, CLOCK(61), { kills: [0, 0], towers: [0, 0] }, 0);
    expect(plate.dataset.dense).toBe('0');
  });

  it("party play's ping chip counts once it is on the plate", () => {
    const { hud, plate } = mount();
    const ping = document.createElement('span');
    ping.className = 'mp-ping';
    plate.querySelector('.mid')!.appendChild(ping);
    hud.update(null, CLOCK(61), { kills: [0, 0], towers: [0, 0] }, 0);
    expect(plate.dataset.dense).toBe('2');
  });
});
