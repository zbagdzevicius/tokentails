import { describe, expect, it } from 'vitest';
import { countUp, fmtInt, fmtTime, resultTitle, totalStars } from './format';
import { TutorialMachine, type TutInput } from './tutorial-logic';

const inp = (o: Partial<TutInput> = {}): TutInput => ({ time: 1, steer: 0, promptAction: null, promptText: '', progress: 0.1, airborne: false, ...o });

describe('format', () => {
  it('formats numbers and times', () => {
    expect(fmtInt(14206.4)).toBe('14,206');
    expect(fmtInt(-1234567)).toBe('-1,234,567');
    expect(fmtInt(NaN)).toBe('0');
    expect(fmtTime(102.4)).toBe('1:42');
    expect(fmtTime(-3)).toBe('0:00');
  });
  it('count-up eases to the target and clamps', () => {
    expect(countUp(1000, 0, 1)).toBe(0);
    expect(countUp(1000, 2, 1)).toBe(1000);
    const mid = countUp(1000, 0.5, 1);
    expect(mid).toBeGreaterThan(500);
    expect(mid).toBeLessThan(1000);
  });
  it('titles and star totals', () => {
    expect(resultTitle(true, true, false, 1)).toBe('Home for dinner!');
    expect(resultTitle(false, false, false, 0)).toBe('Out of hearts!');
    expect(resultTitle(true, false, false, 3)).toBe('PURRFECT!');
    expect(resultTitle(false, false, true, 0)).toBe('Run over!');
    expect(totalStars({ a: { stars: [true, false, true] }, b: undefined, c: { stars: [true, true, true] } })).toBe(5);
  });
});

describe('tutorial machine', () => {
  it('runs steer -> jump -> slide -> pounce -> vault, each finished by its move', () => {
    const m = new TutorialMachine();
    expect(m.update(0.1, inp({ time: 0.2 }))).toBe(null);
    expect(m.update(0.1, inp())).toBe('steer');
    m.update(0.2, inp({ steer: 1 }));
    m.update(0.2, inp({ steer: 1 }));
    expect(m.active).toBe(null);
    expect(m.update(0.1, inp({ promptAction: 'jump', promptText: 'JUMP!' }))).toBe('jump');
    m.event('slide');
    expect(m.active).toBe('jump');
    m.event('jump');
    expect(m.update(0.1, inp({ promptAction: 'slide' }))).toBe('slide');
    m.event('slide');
    expect(m.update(0.1, inp({ promptAction: 'jump', promptText: 'JUMP + JUMP: POUNCE!' }))).toBe('pounce');
    m.event('pounce');
    expect(m.update(0.1, inp({ promptAction: 'ability', promptText: 'TAIL VAULT!' }))).toBe('vault');
    m.event('abilityStart');
    expect(m.finished).toBe(true);
    expect(m.update(0.1, inp({ promptAction: 'jump' }))).toBe(null);
  });
  it('times out a card nobody acts on, and a later prompt can jump the queue', () => {
    const m = new TutorialMachine();
    m.update(0.1, inp());
    expect(m.active).toBe('steer');
    for (let i = 0; i < 80; i++) m.update(0.1, inp());
    expect(m.active).toBe(null);
    expect(m.done.has('steer')).toBe(true);
    // vault prompt before jump/slide were taught (dev.jump mid-stage)
    expect(m.update(0.1, inp({ promptAction: 'ability', promptText: 'TAIL VAULT!' }))).toBe('vault');
  });
  it('cards show only near their set piece: PUFF HOVER is no vault, a passed prompt hides the card', () => {
    const m = new TutorialMachine();
    m.update(0.1, inp());
    for (let i = 0; i < 80; i++) m.update(0.1, inp());
    // a full PUFF meter shows an ability prompt long before the vault
    expect(m.update(0.1, inp({ promptAction: 'ability', promptText: 'PUFF HOVER!' }))).toBe(null);
    expect(m.update(0.1, inp({ promptAction: 'jump', promptText: 'JUMP!' }))).toBe('jump');
    // the player got past the log without jumping: the card goes once the prompt is gone
    for (let i = 0; i < 12; i++) m.update(0.1, inp());
    expect(m.active).toBe(null);
    expect(m.done.has('jump')).toBe(false);
    // and comes back at the next log
    expect(m.update(0.1, inp({ promptAction: 'jump', promptText: 'JUMP!' }))).toBe('jump');
    m.event('jump');
    expect(m.done.has('jump')).toBe(true);
  });
  it('an early pounce skips its lesson', () => {
    const m = new TutorialMachine();
    m.event('pounce');
    expect(m.done.has('pounce')).toBe(true);
  });
});
