/**
 * Skill codex (src/ui/skillCodex.ts): every hero has a learnable card for its passive, basic attack and Q W E R, and
 * every number on a card is the data's own (read at build time, never a copy).
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES, type AbilitySlot } from '../../src/data/heroes';
import { CC_DR } from '../../src/data/effects';
import { kitNumbers } from '../../src/sim/heroes/talents';
import { sec } from '../../src/ui/heroText';
import { COUNTERPLAY_RULES, HARD_CC_TAGS, heroCodex, SKILL_SLOTS, SKILL_WORDS, skillCard, TAG_TEXT } from '../../src/ui/skillCodex';
import { ENGINE_KEYS } from '../../src/ui/skillCodex/facts';
import { attackRows } from '../../src/ui/slotTip';

const SLOTS: readonly AbilitySlot[] = ['q', 'w', 'e', 'r'];

/** The data number behind a fact key ("q.dmg", "passive.bonusBp", "base.range") at level 1 with no talents. */
function dataNumber(hero: (typeof HERO_IDS)[number], key: string): number | undefined {
  const [slot, k] = key.split('.');
  const h = HEROES[hero];
  if (slot === 'base') return (h.base as unknown as Record<string, number | undefined>)[k];
  if (slot === 'passive') return h.passive[k];
  return (h.abilities[slot as AbilitySlot] as Record<string, number | undefined>)[k];
}

describe('skill codex', () => {
  it('has words for every hero and every slot', () => {
    for (const h of HERO_IDS) {
      expect(SKILL_WORDS[h], h).toBeDefined();
      for (const s of SKILL_SLOTS) expect(SKILL_WORDS[h][s], `${h} ${s}`).toBeDefined();
    }
  });

  it('builds six complete cards per hero, short enough for a phone', () => {
    for (const h of HERO_IDS) {
      const x = heroCodex(h);
      expect(x.cards.map((c) => c.slot)).toEqual(SKILL_SLOTS);
      for (const c of x.cards) {
        const id = `${h} ${c.slot}`;
        expect(c.name.length, id).toBeGreaterThan(0);
        expect(c.what.length, id).toBeGreaterThan(0);
        expect(c.what.length, id).toBeLessThanOrEqual(130);
        expect(c.tip.length, id).toBeGreaterThan(0);
        expect(c.tip.length, id).toBeLessThanOrEqual(140);
        expect(c.counter.length, id).toBeGreaterThan(0);
        expect(c.counter.length, id).toBeLessThanOrEqual(140);
        expect(c.facts.length, id).toBeGreaterThan(0);
        for (const t of c.tags) expect(TAG_TEXT[t], `${id} ${t}`).toBeDefined();
        if (c.slot !== 'basic') expect(c.tags.length, id).toBeGreaterThan(0);
        const words = [c.what, c.tip, c.counter, ...c.facts.map((f) => `${f.label} ${f.value}`)].join(' ');
        expect(words, id).not.toMatch(/undefined|NaN|\?/);
        if (c.slot === 'q' || c.slot === 'w' || c.slot === 'e' || c.slot === 'r') {
          expect(c.key).toBe(c.slot.toUpperCase());
          expect(c.icon, id).toBeDefined();
        }
      }
      expect(x.cards[5].unlocks).toBe(4);
    }
  });

  it('reads every fact from the data (level 1, no talents)', () => {
    for (const h of HERO_IDS) {
      for (const c of heroCodex(h).cards) {
        for (const f of c.facts) {
          if (!f.keys.length) continue;
          const id = `${h} ${c.slot} ${f.label}`;
          expect(Number.isFinite(f.raw), id).toBe(true);
          expect(f.raw, id).toBe(dataNumber(h, f.keys[0]));
        }
      }
    }
  });

  it('shows every number a player can read (or names it an engine detail)', () => {
    for (const h of HERO_IDS) {
      const shown = new Set(heroCodex(h).cards.flatMap((c) => c.facts.flatMap((f) => f.keys)));
      const groups: [string, Readonly<Record<string, number | undefined>>][] = [['passive', HEROES[h].passive], ...SLOTS.map((s) => [s, HEROES[h].abilities[s]] as [string, Record<string, number | undefined>])];
      for (const [slot, nums] of groups) {
        for (const [k, v] of Object.entries(nums)) {
          if (v === 0 || ENGINE_KEYS.has(k)) continue;
          if (k.endsWith('PerLevel') && shown.has(`${slot}.${k.slice(0, -'PerLevel'.length)}`)) continue;
          expect(shown.has(`${slot}.${k}`), `${h} ${slot}.${k} has no fact`).toBe(true);
        }
      }
    }
  });

  it('shows the growth on the pick screen: per level and per rank, from the data', () => {
    for (const h of HERO_IDS) {
      for (const s of SLOTS) {
        const a = HEROES[h].abilities[s];
        if (a.dmg === undefined) continue;
        const card = skillCard(h, s);
        const dmg = card.facts.find((f) => f.keys[0] === `${s}.dmg`);
        expect(dmg, `${h} ${s}`).toBeDefined();
        const per = a.dmgPerLevel ? `+${a.dmgPerLevel}/lvl` : '';
        const rk = HEROES[h].ranks[s]?.dmg;
        const grow = [per, rk ? `+${rk} a rank` : ''].filter(Boolean).join(', ');
        expect(dmg!.value).toBe(`${a.dmg}${grow ? ` (${grow})` : ''}`);
        const cd = card.facts.find((f) => f.label === 'Cooldown')!;
        expect(cd.value.startsWith(sec(a.cooldown))).toBe(true);
      }
    }
  });

  it('shows the sim numbers at a level (ranks and per-level growth in)', () => {
    for (const h of HERO_IDS) {
      for (const level of [1, 5, 10]) {
        const kit = kitNumbers(HERO_IDS.indexOf(h), level);
        for (const s of SLOTS) {
          const a = kit[s];
          const card = skillCard(h, s, { level });
          expect(card.facts.find((f) => f.label === 'Cooldown')!.value, `${h} ${s} ${level}`).toBe(sec(a.cooldown));
          if (a.dmg !== undefined) {
            const f = card.facts.find((x) => x.keys[0] === `${s}.dmg`)!;
            expect(f.value, `${h} ${s} ${level}`).toBe(String(a.dmg + (a.dmgPerLevel ?? 0) * (level - 1)));
          }
          expect(card.rank).toBeGreaterThanOrEqual(s === 'r' && level < 4 ? 0 : 1);
        }
        const basic = skillCard(h, 'basic', { level });
        const b = HEROES[h].base;
        expect(basic.facts.find((f) => f.label === 'Damage')!.value).toBe(String(b.attack + b.attackPerLevel * (level - 1)));
        // the swings a second match the desktop tooltip's (ui/slotTip.ts), which reads the same sim numbers
        expect(basic.facts.find((f) => f.label === 'Attacks')!.value).toBe(new Map(attackRows(h, level)).get('Attack speed'));
      }
    }
  });

  it('follows the talent picks', () => {
    // Sage tier 1 option 0, Wide Volley: the arrow count comes from the talent's own mods
    const wide = HEROES.sage.talents[0][0].mods!.q!.arrows;
    const card = skillCard('sage', 'q', { level: 3, choices: [0, -1, -1] });
    expect(card.facts.find((f) => f.keys[0] === 'q.arrows')!.value).toBe(String(wide));
  });

  it('tags crowd control and telegraphs from the data', () => {
    for (const h of HERO_IDS) {
      for (const s of SLOTS) {
        const a = HEROES[h].abilities[s];
        const card = skillCard(h, s);
        if ((a.stun ?? 0) > 0) expect(card.tags, `${h} ${s}`).toContain('stun');
        if ((a.root ?? 0) > 0 || (a.freeze ?? 0) > 0) expect(card.tags, `${h} ${s}`).toContain('root');
        if ((a.fear ?? 0) > 0) expect(card.tags, `${h} ${s}`).toContain('fear');
        if ((a.charm ?? 0) > 0) expect(card.tags, `${h} ${s}`).toContain('charm');
        if ((a.windup ?? 0) >= 9) expect(card.tags, `${h} ${s}`).toContain('windup');
        // a charm's walk speed is stored as slowBp; it is not a slow
        if ((a.charm ?? 0) > 0) expect(card.tags, `${h} ${s}`).not.toContain('slow');
      }
    }
    expect(HARD_CC_TAGS).toContain('stun');
  });

  it('words the counter-play rules from the data', () => {
    const rules = COUNTERPLAY_RULES();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].text).toContain(sec(CC_DR.cap));
    expect(rules[0].text).toContain(sec(CC_DR.immune));
  });
});
