// @vitest-environment happy-dom
/**
 * GAPS B2 client side: Forfeit only from match 4 (never Rookie), its time per difficulty, the pause menu's confirm
 * step, the results "why" line, 20 Treat XP only, and a full ladder loss (no grade share, no placement shield).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { FORFEIT_FROM_MATCH, forfeitTick } from '../../src/app/firstSession';
import { endCause } from '../../src/app/endCause';
import { PLACEMENT, recordLadder } from '../../src/meta/ladder';
import { loadProfile, resetProfileCache, saveProfile } from '../../src/meta/profile';
import { TREAT_XP, treatXpFor } from '../../src/meta/treats';
import { menuScreen } from '../../src/ui/screens';

describe('forfeitTick (GAPS B2, Your call 5)', () => {
  it('never in matches 1–3, also for a veteran on Normal', () => {
    expect(FORFEIT_FROM_MATCH).toBe(3);
    for (const m of [0, 1, 2]) for (const d of ['rookie', 'easy', 'normal', 'hard'] as const) expect(forfeitTick(m, d)).toBe(0);
  });

  it('from match 4: Easy 3:00, Normal and Hard 4:00, Rookie never', () => {
    expect(forfeitTick(3, 'easy')).toBe(5400);
    expect(forfeitTick(3, 'normal')).toBe(7200);
    expect(forfeitTick(9, 'hard')).toBe(7200);
    expect(forfeitTick(9, 'rookie')).toBe(0);
  });
});

describe('forfeit rewards (GAPS B2)', () => {
  it('20 Treat XP, whatever the takedowns or Pudding', () => {
    expect(TREAT_XP.forfeit).toBe(20);
    expect(treatXpFor({ won: false, takedowns: 12, pudding: true, forfeit: true })).toBe(20);
    expect(treatXpFor({ won: false, takedowns: 0, pudding: false })).toBe(TREAT_XP.loss);
  });

  it('the results line says the player forfeited', () => {
    expect(endCause({ won: false, reason: 'forfeit', phase: 'play', top: null, kills: [3, 9], towers: [0, 3], oursForward: 0, oursAlive: 3 })).toBe('You forfeited the match.');
  });
});

describe('forfeit on the ladder (GAPS B2: full loss)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProfileCache();
    const p = loadProfile();
    p.rating = 1000;
    saveProfile(p);
  });
  const play = (o: { won?: boolean; grade?: 'S' | 'C'; forfeit?: boolean }) =>
    recordLadder({ won: o.won ?? false, difficulty: 'normal', hero: 'clem', heroName: 'Clem', seconds: 300, takedowns: 2, grade: o.grade ?? 'S', forfeit: o.forfeit });

  it('an S-grade forfeit costs the whole step (an S loss costs half)', () => {
    const p = loadProfile();
    p.ladderGames = PLACEMENT;
    saveProfile(p);
    expect(play({ grade: 'S' })?.delta).toBe(-6);
    const f = play({ grade: 'S', forfeit: true });
    expect(f?.delta).toBe(-12);
    expect(f?.impact).toBe(1);
  });

  it('a forfeit during placement still costs points', () => {
    const f = play({ forfeit: true });
    expect(f?.placement).toBe(0);
    expect(f?.delta).toBe(-12);
  });
});

describe('pause menu Forfeit (GAPS B2)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  const open = (forfeit?: { from: number; tick: number }) => {
    const calls: string[] = [];
    const root = menuScreen(document.body, {
      muted: false,
      touch: true,
      onResume: () => calls.push('resume'),
      onMute: () => calls.push('mute'),
      onLeave: () => calls.push('leave'),
      ...(forfeit ? { forfeit, onForfeit: () => calls.push('forfeit') } : {}),
    });
    const click = (a: string) => root.querySelector<HTMLElement>(`[data-a="${a}"]`)!.click();
    return { root, calls, click };
  };

  it('no Forfeit button without the option (matches 1–3, Rookie)', () => {
    const { root } = open();
    expect(root.querySelector('[data-a="forfeit"]')).toBeNull();
  });

  it('before its time the button is disabled and names the time', () => {
    const { root, calls, click } = open({ from: 7200, tick: 3000 });
    const b = root.querySelector<HTMLButtonElement>('[data-a="forfeit"]')!;
    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe('Forfeit from 4:00');
    click('forfeit');
    expect(root.querySelector('[data-a="forfeit-yes"]')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('a confirm step: Keep playing goes back, Forfeit sends it', () => {
    const { root, calls, click } = open({ from: 5400, tick: 6000 });
    click('forfeit');
    expect(calls).toEqual([]);
    expect(root.textContent).toContain('Forfeit this match?');
    expect(root.textContent).toContain('20 Treat XP');
    click('forfeit-no');
    expect(root.querySelector('[data-a="resume"]')).not.toBeNull();
    click('forfeit');
    click('forfeit-yes');
    expect(calls).toEqual(['forfeit']);
  });
});
