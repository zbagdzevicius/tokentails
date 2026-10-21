// @vitest-environment happy-dom
/**
 * GAPS B6 (sim v10): level-6 shape branches for Sage (Piercing Shot) and Sir Brutus (Guard Post). The kit maths is in
 * tests/unit/heroes/sage.test.ts and brutus.test.ts; this file covers the data contract, the bot rule, the aim shapes
 * and the client reads (talent card, own ability bar, enemy portrait).
 */
import { describe, expect, it } from 'vitest';
import { BRANCH_HEROES, BRANCH_TALENT, HERO_IDS, HEROES } from '../../src/data/heroes';
import { PROJECTILE_KIND } from '../../src/data/towers';
import { aimFor, maxCooldown } from '../../src/input/abilities';
import { fireBolt } from '../../src/sim/combat/attack';
import { fireSkillshot } from '../../src/sim/effects/projectile';
import { guardBlocks } from '../../src/sim/heroes/brutus';
import type { EntitySnap, MatchClock } from '../../src/sim/api';
import { botTalentChoice, chooseTalent } from '../../src/sim/heroes/talents';
import { HERO_TEXT, TALENT_SHORT, branchNumbers } from '../../src/ui/heroText';
import { Hud } from '../../src/ui/hud';
import { TalentPicker } from '../../src/ui/talents';
import { RANGE } from '../../src/sim/world';
import { MID, cast, heroMatch, hold, place, setLevel, steps, tanky } from './heroes/kit-helpers';

const snap = (e: Partial<EntitySnap> & Pick<EntitySnap, 'id' | 'kind' | 'team'>): EntitySnap => ({ slot: 0, x: 0, y: 0, hp: 100, maxHp: 100, shield: 0, state: 'idle', facing: 0, buffs: 0, ...e });
const CLOCK: MatchClock = { tick: 0, seconds: 0, phase: 'play', nextPhaseIn: 0 };

describe('B6: branch data', () => {
  it('Sage and Sir Brutus have a branch at level 6 option 2; the others are "coming soon"', () => {
    expect(BRANCH_HEROES).toEqual(['sage', 'brutus']);
    for (const h of HERO_IDS) {
      const id = BRANCH_TALENT[h];
      if (id === null) {
        expect(HERO_TEXT[h].branch).toBeUndefined();
        continue;
      }
      expect(HEROES[h].talents[1][1].id).toBe(id);
      expect(HERO_TEXT[h].talents[id]).toBeTruthy();
      expect(TALENT_SHORT[id]).toBeTruthy();
      expect(HERO_TEXT[h].branch?.name).toBe(HEROES[h].talents[1][1].name);
    }
    expect(HEROES.sage.talents[1][1].mods?.q).toMatchObject({ lance: 1, range: 9000, width: 600 });
    expect(HEROES.brutus.talents[1][1].mods?.w).toMatchObject({ post: 1, postRadius: 3000, postDuration: 60 });
  });

  it("--bot-talents branch takes option 2 at level 6 only; 'seeded' stays a per-slot draw", () => {
    for (let seed = 1; seed < 20; seed++) {
      expect(botTalentChoice(seed, 3, 1, 'branch')).toBe(1);
      expect(botTalentChoice(seed, 3, 0, 'branch')).toBe(botTalentChoice(seed, 3, 0, 'seeded'));
    }
  });

  it('numbers in words for the hover card', () => {
    expect(branchNumbers('sage')).toBe('7 s cooldown · 95 (+14/lvl) dmg · 9 m');
    expect(branchNumbers('brutus')).toBe('10 s cooldown · 3 m dome · lasts 2 s · 25% less damage');
    expect(branchNumbers('clem')).toBe('');
  });
});

describe('B6: aim shapes', () => {
  it('Piercing Shot aims a 9 m line; Guard Post shows a 3 m ring; without the branch nothing changes', () => {
    expect(aimFor('sage', 0)).toMatchObject({ kind: 'dir', shape: 'cone' });
    expect(aimFor('sage', 0, true)).toMatchObject({ kind: 'dir', shape: 'line', range: 9000, width: 600 });
    expect(aimFor('sage', 1, true)).toEqual(aimFor('sage', 1));
    expect(aimFor('brutus', 1)).toMatchObject({ shape: 'cone' });
    expect(aimFor('brutus', 1, true)).toMatchObject({ kind: 'self', shape: 'ring', radius: 3000 });
    expect(aimFor('clem', 0, true)).toEqual(aimFor('clem', 0));
    expect(maxCooldown('brutus', 1, 'pounce')).toBe(420);
    expect(maxCooldown('brutus', 1, 'pounce', true)).toBe(300);
    expect(maxCooldown('sage', 0, 'pounce', true)).toBe(210);
  });
});

describe('B6: client reads', () => {
  it('the level-6 card tags the branch, and a hero without one says "Branch coming soon"', () => {
    const sage = new TalentPicker(document.body, 'sage', () => {});
    sage.offer(1);
    expect(sage.root.querySelector('button.branch b')?.textContent).toBe('Piercing ShotNew shape');
    expect(sage.root.querySelector('.soon')).toBeNull();
    sage.dispose();
    const clem = new TalentPicker(document.body, 'clem', () => {});
    clem.offer(1);
    expect(clem.root.querySelector('.head .soon')?.textContent).toBe('Branch coming soon');
    expect(clem.root.querySelector('button.branch')).toBeNull();
    clem.dispose();
    const lvl3 = new TalentPicker(document.body, 'clem', () => {});
    lvl3.offer(0);
    expect(lvl3.root.querySelector('.soon')).toBeNull();
    lvl3.dispose();
  });

  it('the own bar swaps the branched slot; an enemy portrait shows the badge once the hero takes it', () => {
    document.body.innerHTML = '';
    const hud = new Hud(document.body, 'brutus', 'pounce', { onSlot: () => {} });
    const w = document.querySelector<HTMLElement>('.pl-slot[data-i="1"]')!;
    expect(w.getAttribute('aria-label')).toMatch(/^Front Guard/);
    hud.update(snap({ id: 0, kind: 'hero', team: 1, hero: 'brutus', level: 6, branch: true }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 1);
    expect(w.getAttribute('aria-label')).toMatch(/^Guard Post/);
    expect(w.classList.contains('branch')).toBe(true);
    hud.mountStrip(['clem', 'sage', 'lambo', 'brutus', 'cacklejaw', 'gabe'], 3, 1, ['Clem', 'Sage', 'Lambo', 'You', 'Cacklejaw', 'Gabė']);
    const sage = document.querySelector<HTMLElement>('.pp[data-slot="1"]')!;
    expect(sage.querySelector('.br')).not.toBeNull();
    expect(document.querySelector('.pp[data-slot="0"] .br')).toBeNull(); // Clem: no branch yet
    hud.stripUpdate(new Map([[1, snap({ id: 1, kind: 'hero', team: 0, hero: 'sage' })]]), 0, null);
    expect(sage.classList.contains('branch')).toBe(false);
    hud.stripUpdate(new Map([[1, snap({ id: 1, kind: 'hero', team: 0, hero: 'sage', branch: true })]]), 1, null);
    expect(sage.classList.contains('branch')).toBe(true);
    expect(sage.title).toBe('Sage · Piercing Shot');
    hud.dispose();
  });
});

describe('B6: Guard Post shields only its own team inside the dome', () => {
  // Sir Brutus (0) and Sage (1) vs Clem (3) and Sage (4); the dome is 3 m around MID.
  function planted() {
    const m = heroMatch(['brutus', 'sage', 'clem', 'clem', 'sage', 'cacklejaw']);
    place(m, 0, MID.x, MID.y, 0);
    place(m, 1, MID.x - 15000, MID.y + 15000, 0);
    place(m, 3, MID.x + 6000, MID.y, 2048);
    place(m, 4, MID.x + 20000, MID.y - 20000, 2048);
    hold(m, 0, 1, 3, 4);
    tanky(m, 1, 3, 4);
    setLevel(m, 0, 6);
    expect(chooseTalent(m, 0, 1, 1)).toBe(true);
    cast(m, 0, 1, MID.x + 6000, MID.y);
    return m;
  }

  it('a bolt at Sir Brutus from outside is blocked', () => {
    const m = planted();
    const w = m.world;
    w.kHonour[0] = 0;
    const hp = w.hp[0];
    fireBolt(w, 3, 0, 80, 18000, PROJECTILE_KIND.hero);
    steps(m, 20);
    expect(w.hp[0]).toBe(hp);
  });

  it('an enemy inside the dome shooting an ally outside still lands', () => {
    const m = planted();
    const w = m.world;
    place(m, 3, MID.x + 1000, MID.y, 2048);
    place(m, 1, MID.x - 6000, MID.y, 0);
    const hp = w.hp[1];
    fireBolt(w, 3, 1, 80, 18000, PROJECTILE_KIND.hero);
    steps(m, 20);
    expect(w.hp[1]).toBeLessThan(hp);
  });

  it('a bolt at a neutral objective (Pudding) inside the dome is not blocked; one at an ally inside is', () => {
    const m = planted();
    const w = m.world;
    const pud = RANGE.pudding;
    w.x[pud] = MID.x + 500;
    w.y[pud] = MID.y;
    expect(guardBlocks(w, 1, MID.x + 2000, MID.y, pud)).toBe(false);
    place(m, 1, MID.x - 1000, MID.y, 0);
    expect(guardBlocks(w, 1, MID.x + 2000, MID.y, 1)).toBe(true);
  });

  it('a skillshot is stopped as it enters, but one fired from inside flies out', () => {
    const m = planted();
    const w = m.world;
    const spec = { kind: PROJECTILE_KIND.moonshot, angle: 0, speed: 18000, range: 12000, radius: 300, dmg: 80, flags: 0 };
    place(m, 3, MID.x - 6000, MID.y, 0);
    const inbound = fireSkillshot(w, 3, spec);
    steps(m, 10);
    expect(w.pAlive[inbound]).toBe(0);
    expect(w.pX[inbound]).toBeLessThan(MID.x);
    place(m, 3, MID.x + 1000, MID.y, 0);
    const outbound = fireSkillshot(w, 3, spec);
    steps(m, 5);
    expect(w.pAlive[outbound]).toBe(1);
    expect(w.pX[outbound]).toBeGreaterThan(MID.x + 3000);
    // Fired from inside at Sir Brutus inside: it flies through him without a hit.
    place(m, 3, MID.x - 1500, MID.y, 0);
    w.kHonour[0] = 0;
    const hp = w.hp[0];
    fireSkillshot(w, 3, spec);
    steps(m, 10);
    expect(w.hp[0]).toBe(hp);
  });
});
