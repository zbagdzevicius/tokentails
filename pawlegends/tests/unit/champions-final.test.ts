// @vitest-environment happy-dom
/**
 * The shelter champions' final-spec pass (sim v9): Avietė's charge ring (sim → snapshot → wire → HUD/overhead), the
 * Striking Pose "!" eye read, Gabė's bot ultimate rule, the hero-fight tuning, the corrected copy and the info-only
 * lobby panel (the champion-offer Meet card is the one purchase surface).
 */
import { describe, expect, it } from 'vitest';
import { BOTS } from '../../src/data/bots';
import { HEROES } from '../../src/data/heroes';
import { decodeSnap, encodeSnap } from '../../src/host/protocol';
import { poseWatchers, type PoseHero } from '../../src/render/telegraph';
import { fightCast } from '../../src/sim/bots/casts';
import { snapshot } from '../../src/sim/index';
import { Op } from '../../src/sim/api';
import { Rng } from '../../src/sim/rng';
import { chargeRing } from '../../src/ui/overhead';
import { championInfo, championMeetLine, meetCard } from '../../src/ui/cards';
import { HERO_TEXT } from '../../src/ui/heroText';
import { MID, heroMatch, hold, place, setLevel } from './heroes/kit-helpers';

describe('hero-fight tuning (final spec, species balance nudges)', () => {
  it('Lambo 10500, Avietė 13000, Gabė takes 10000, Bengas unchanged', () => {
    expect(HEROES.lambo.pvp).toEqual({ dmgBp: 10500, takenBp: 9100 });
    expect(HEROES.aviete.pvp).toEqual({ dmgBp: 13000, takenBp: 8600 });
    expect(HEROES.gabe.pvp).toEqual({ dmgBp: 9800, takenBp: 10000 });
    expect(HEROES.bengas.pvp).toEqual({ dmgBp: 11000, takenBp: 9100 });
  });
});

describe('Avietė charge ring', () => {
  it('the snapshot sends the lockout to her own team only; the wire keeps it', () => {
    const m = heroMatch(['aviete', 'clem', 'sage', 'clem', 'sage', 'clem']);
    m.world.kHuntT[0] = 200;
    const own = snapshot(m, 0).entities.find((e) => e.id === 0)!;
    const foe = snapshot(m, 1).entities.find((e) => e.id === 0)!;
    expect(own.lockout).toBe(200);
    expect(foe.lockout).toBeUndefined();
    const back = decodeSnap(encodeSnap(snapshot(m, 0))).entities.find((e) => e.id === 0)!;
    expect(back.lockout).toBe(200);
    m.world.kHuntT[0] = 0;
    expect(decodeSnap(encodeSnap(snapshot(m, 0))).entities.find((e) => e.id === 0)!.lockout).toBeUndefined();
  });

  it('chargeRing: spark while Charged (both teams), grey with seconds during the lockout, nothing for other heroes', () => {
    expect(chargeRing({ hero: 'aviete', charged: true, state: 'idle' }).state).toBe('charged');
    expect(chargeRing({ hero: 'aviete', lockout: 240, state: 'idle' })).toEqual({ state: 'lockout', frac: 1, secs: 8 });
    expect(chargeRing({ hero: 'aviete', lockout: 31, state: 'idle' }).secs).toBe(2);
    expect(chargeRing({ hero: 'aviete', state: 'idle' }).state).toBe('');
    expect(chargeRing({ hero: 'aviete', charged: true, state: 'dead' }).state).toBe('');
    expect(chargeRing({ hero: 'clem', charged: true, lockout: 10, state: 'idle' }).state).toBe('');
  });

  it('Shiny Coat says it gives speed only during the lockout', () => {
    expect(HERO_TEXT.aviete.abilities[1].text).toMatch(/locked out: speed only/);
  });
});

describe('Striking Pose eye glyph (poseWatchers)', () => {
  const src: PoseHero = { id: 0, x: 0, y: 0, team: 0, facing: 0, kind: 'hero', state: 'casting' };
  const hero = (id: number, x: number, y: number, facing: number, team = 1): PoseHero => ({ id, x, y, team, facing, kind: 'hero', state: 'idle' });

  it('marks the heroes of the other team in the cone that face Bengas, not those looking away or out of the cone', () => {
    const out = poseWatchers(
      src,
      3000,
      0,
      [
        hero(3, 3000, 0, 2048), // facing west, at him
        hero(4, 3000, 1200, 0), // in the cone, facing away
        hero(5, -3000, 0, 0), // behind him, facing him
        hero(1, 2000, 0, 2048, 0), // his own team
        hero(2, 9000, 0, 2048), // beyond 4 m
      ],
      new Set(),
    );
    expect([...out]).toEqual([3]);
  });

  it('±90° counts as facing him (facingArc 2048), just past it does not', () => {
    expect(poseWatchers(src, 3000, 0, [hero(3, 3000, 0, 2048 + 1000)], new Set()).has(3)).toBe(true);
    expect(poseWatchers(src, 3000, 0, [hero(3, 3000, 0, 2048 + 1100)], new Set()).has(3)).toBe(false);
  });
});

describe('Gabė bot ultimate rule', () => {
  function arena() {
    const m = heroMatch(['gabe', 'clem', 'sage', 'clem', 'sage', 'clem']);
    place(m, 0, MID.x, MID.y, 0);
    place(m, 1, MID.x - 20000, MID.y + 15000, 0);
    place(m, 2, MID.x - 20000, MID.y - 15000, 0);
    place(m, 3, MID.x + 4000, MID.y, 2048);
    place(m, 4, MID.x + 20000, MID.y - 20000, 2048);
    place(m, 5, MID.x + 20000, MID.y + 20000, 2048);
    hold(m, 0, 1, 2, 3, 4, 5);
    setLevel(m, 0, 6);
    return m;
  }
  const ult = (m: ReturnType<typeof arena>): boolean => {
    const c = fightCast(m.world, 0, 3, BOTS.normal, new Rng(7));
    return !!c && c.op === Op.Cast && c.slot === 3;
  };

  it('never on one lone enemy hero with no ally near it', () => {
    expect(ult(arena())).toBe(false);
  });

  it('on one enemy hero with an allied hero within 4 m of it', () => {
    const m = arena();
    place(m, 1, MID.x + 4000, MID.y + 3500, 0);
    expect(ult(m)).toBe(true);
  });

  it('on 2+ enemy heroes in the cone', () => {
    const m = arena();
    place(m, 4, MID.x + 4500, MID.y + 800, 2048);
    expect(ult(m)).toBe(true);
  });
});

describe('copy (final spec)', () => {
  it('Lambo: 10% near a friend; Big Hug 7% / 4.5% of his max HP; Bengas: the rest of the cone is slowed', () => {
    expect(HERO_TEXT.lambo.passive.text).toBe('Takes 10% less damage near an allied hero.');
    expect(HERO_TEXT.lambo.abilities[1].text).toMatch(/7% of your max HP.*4\.5%/);
    expect(HERO_TEXT.bengas.abilities[1].text).toMatch(/the rest slowed/);
  });

  it('the champion Meet card: "Inspired by…", "See <name>\'s card", no adopt, price or impact words', () => {
    expect(championMeetLine('Lambo', 'he', 'STELLAR')).toMatch(/^Inspired by Lambo's Token Tails card\./);
    const el = meetCard({ cat: { catalogId: '6a30473c1d6649b19b03622b', name: 'Lambo', type: 'STELLAR' }, champion: { pronoun: 'he' }, onMeet() {}, onClose() {} });
    expect(el.querySelector('[data-a="meet"]')?.textContent).toBe("See Lambo's card ›");
    expect(el.textContent).not.toMatch(/adopt|\$|€|price|donat|fund|shelter|help/i);
  });

  it('the lobby champion panel is information only (no buy link)', () => {
    const el = championInfo({ name: 'Lambo', pronoun: 'he', type: 'STELLAR', owned: false });
    expect(el.querySelector('[data-a="champion-meet"], .plc-meet-go')).toBeNull();
    expect(el.textContent).toContain("Lambo is inspired by his Token Tails card. Every player can pick him.");
  });
});
