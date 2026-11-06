// @vitest-environment happy-dom
/**
 * Audit 2026-11-06 quick wins, UI and meta (no sim change): GP-05 results copy by fight share, UX-04 reward strip,
 * UX-08 Home on results, UX-12 hero portraits in the results table and no bot called "Tank".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { joinedFights, menuScreen, resultLine, resultsScreen, rewardStrip, type ResultRow, type ResultsOpts } from '../../src/ui/screens';
import { progressBlock, progressRows } from '../../src/ui/progressSummary';
import { CAT_NAMES, DOG_NAMES } from '../../src/ui/heroText';
import { collectionPanel } from '../../src/ui/collection';
import { settingsPanel } from '../../src/ui/settings';
import { freshTreats } from '../../src/meta/treats';
import { bareAllies, FIGHT_PX, statusGlyph } from '../../src/ui/overhead';
import type { SlotStats } from '../../src/sim/api';

const row = (rel: string, k: number, a: number, heroDmg: number): ResultRow => ({ name: rel, rel, k, d: 0, a, heroDmg, towerDmg: 0 });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('GP-05 results copy follows the player share of the fights', () => {
  it('a win with an assist and a little damage is not "with your help"', () => {
    // the audit's idle win at 0/0/1: an assist and some auto-attack damage
    const table = [row('self', 0, 1, 300), row('ally', 6, 3, 4000), row('ally', 4, 5, 3500)];
    expect(joinedFights({ kills: 0, assists: 1, teamKills: [10, 4], heroDamage: 300, table })).toBe(false);
    expect(resultLine({ won: true, kills: 0, assists: 1, teamKills: [10, 4], difficulty: 'rookie', heroDamage: 300, table })).toMatch(/jump into a fight/);
  });

  it('a real share of takedowns or hero damage earns "with your help"', () => {
    const kp = [row('self', 0, 4, 900), row('ally', 6, 1, 4000), row('ally', 4, 2, 3500)];
    expect(resultLine({ won: true, kills: 0, assists: 4, teamKills: [10, 4], difficulty: 'easy', heroDamage: 900, table: kp })).toMatch(/with your help/);
    const dmg = [row('self', 0, 1, 2000), row('ally', 6, 3, 4000), row('ally', 4, 5, 3500)];
    expect(joinedFights({ kills: 0, assists: 1, teamKills: [10, 4], heroDamage: 2000, table: dmg })).toBe(true);
  });
});

describe('UX-04 reward strip, UX-08 Home', () => {
  const base: ResultsOpts = {
    won: true, seconds: 400, hero: 'clem', difficulty: 'easy', kills: 3, deaths: 1, assists: 2, level: 7, teamKills: [9, 4], firstWin: false, best: false,
    dareLink: 'https://example.test/dare', onAgain: () => undefined, onChange: () => undefined, onShare: () => undefined,
  };

  it('pins the grade, the Treat XP bar, the chest and the dare link', () => {
    const html = rewardStrip({
      grade: { grade: 'A', xp: 25, mvp: { name: 'You', you: true } },
      treats: { before: 0.2, after: 0.6, gained: 80, rewards: [{ id: 'emote.wave', name: 'Wave emote' }], next: { name: 'Next' }, toGo: 50, dayBonus: 0 } as never,
      dareLink: 'https://example.test/dare',
    });
    document.body.innerHTML = html;
    expect(document.querySelector('.rw-grade b')?.textContent).toBe('A');
    expect(document.querySelector('.rw-treat small')?.textContent).toBe('+80 Treat XP');
    expect(document.querySelector('.rw-chest')?.textContent).toContain('Wave emote');
    expect(document.querySelector('.rw-share[data-a="share"]')).not.toBeNull();
    expect(rewardStrip({ grade: null, treats: null, dareLink: null })).toBe('');
  });

  it('the results screen has Home and the strip; Home calls onHome; both share buttons say "Link copied!"', () => {
    const calls: string[] = [];
    const root = resultsScreen(document.body, { ...base, onHome: () => calls.push('home'), onShare: () => calls.push('share') });
    expect(root.querySelector('.pl-reward')).not.toBeNull();
    (root.querySelector('[data-a="home"]') as HTMLElement).click();
    (root.querySelector('.rw-share') as HTMLElement).click();
    expect(calls).toEqual(['home', 'share']);
    for (const b of root.querySelectorAll('[data-a="share"]')) expect(b.textContent).toBe('Link copied!');
  });
});

describe('UX-12 results table names the hero', () => {
  const stat = (slot: number, hero: SlotStats['hero']): SlotStats => ({ slot, hero, kills: 0, deaths: 0, assists: 0, heroDamage: 0, towerDamage: 0, level: 5, damageTaken: 0, healShield: 0, objective: 0, fish: 100 }) as SlotStats;

  it('each row carries its hero and a portrait (a letter without one)', () => {
    const rows = progressRows([stat(0, 'clem'), stat(3, 'brutus')], 0, (s) => (s === 0 ? 'You' : 'Rex the Brutus'), new Map(), (h) => (h === 'clem' ? 'data:image/png;base64,AAAA' : null));
    document.body.innerHTML = progressBlock({ rows, sources: [] });
    expect(document.querySelector('tr[data-hero="clem"] img.hp')).not.toBeNull();
    expect(document.querySelector('tr[data-hero="brutus"] .hp.none')?.textContent).toBe('B');
    // only baked data or blob URLs are used
    const bad = progressRows([stat(0, 'clem')], 0, () => 'x', new Map(), () => 'javascript:alert(1)');
    expect(progressBlock({ rows: bad, sources: [] })).not.toContain('javascript:');
  });

  it('no bot is called "Tank" (it read as a role)', () => {
    expect([...CAT_NAMES, ...DOG_NAMES]).not.toContain('Tank');
  });
});

describe('UX-09 Settings in the pause menu', () => {
  it('the pause menu offers Settings when the match can open it', () => {
    const calls: string[] = [];
    const root = menuScreen(document.body, { muted: false, onResume: () => undefined, onMute: () => undefined, onLeave: () => undefined, onSettings: () => calls.push('settings') });
    (root.querySelector('[data-a="settings"]') as HTMLElement).click();
    expect(calls).toEqual(['settings']);
    const none = menuScreen(document.body, { muted: false, onResume: () => undefined, onMute: () => undefined, onLeave: () => undefined });
    expect(none.querySelector('[data-a="settings"]')).toBeNull();
  });
});

describe('UX-10 Treat Track and Settings exits', () => {
  const track = (onClose: () => void) =>
    collectionPanel(document.body, { treats: freshTreats(), owned: new Set(), art: {}, portrait: () => null, wornTitle: null, wornFrame: null, onTarget: () => undefined, onWear: () => undefined, onClose });

  it('the Treat Track has a corner ✕ and closes on Esc', () => {
    let n = 0;
    const a = track(() => n++);
    expect(a.querySelector('.card > .pl-x')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(n).toBe(1);
    expect(a.isConnected).toBe(false);
    const b = track(() => n++);
    (b.querySelector('.pl-x') as HTMLElement).click();
    expect(n).toBe(2);
    // a later Esc does nothing more
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(n).toBe(2);
  });

  it('Settings has a corner ✕ that closes it', () => {
    let closed = 0;
    const root = settingsPanel(document.body, { state: { muted: false, tier: 'med', tipsOn: true, stats: null }, onMute: () => undefined, onTier: () => undefined, onTips: () => undefined, onStats: () => undefined, onClose: () => closed++ });
    (root.querySelector('.card > .pl-x') as HTMLElement).click();
    expect(closed).toBe(1);
  });
});

describe('GFX-04 phone overhead declutter', () => {
  const h = (id: number, team: number, sx: number, sy: number) => ({ id, team, sx, sy });
  it('allied bots next to an enemy hero go bar-only; the player, friends and quiet allies keep their plates', () => {
    const heroes = [h(0, 0, 400, 200), h(1, 0, 420, 210), h(2, 0, 700, 100), h(3, 1, 440, 190), h(4, 0, 430, 220)];
    const bare = bareAllies(heroes, 0, 0, new Set([4]));
    expect([...bare]).toEqual([1]);
    // an enemy just past the fight box leaves the ally alone
    expect(bareAllies([h(0, 0, 0, 0), h(1, 0, 100, 100), h(3, 1, 100 + FIGHT_PX.x + 1, 100)], 0, 0).size).toBe(0);
  });
  it('status words become one-glyph icons', () => {
    expect(statusGlyph('Rooted')).toBe('R');
    expect(statusGlyph('Napping')).toBe('z');
    expect(statusGlyph('Unknown')).toBe('U');
  });
});
