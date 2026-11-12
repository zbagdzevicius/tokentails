/**
 * Lore (docs/plans/moba/LORE.md, src/data/lore.ts): every hero has complete lore, the relationships point the right
 * way (a rival on the other side, a friend on the same side), and the copy fits the screens it is written for.
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { LORE, WORLD, bioParagraphs, loreOf } from '../../src/data/lore';

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;
const sentences = (s: string): number => s.split(/(?<=[.!?…])\s+/).filter(Boolean).length;

describe('hero lore', () => {
  it('covers exactly the hero table', () => {
    expect(Object.keys(LORE).sort()).toEqual([...HERO_IDS].sort());
  });

  for (const id of HERO_IDS) {
    it(`${id} has complete lore`, () => {
      const l = loreOf(id);
      const side = HEROES[id].side;
      expect(l.epithet.trim().length).toBeGreaterThan(3);
      expect(l.home).toBe(side === 'cat' ? 'Purrhaven Isle' : 'Isle of Woof');
      expect(sentences(l.hook)).toBeGreaterThanOrEqual(2);
      expect(sentences(l.hook)).toBeLessThanOrEqual(3);
      expect(words(l.bio)).toBeGreaterThanOrEqual(120);
      expect(words(l.bio)).toBeLessThanOrEqual(185);
      expect(bioParagraphs(id).length).toBeGreaterThanOrEqual(2);
      expect(l.quote.trim().length).toBeGreaterThan(5);
      expect(l.quote).not.toMatch(/^["“']/);
      expect(l.howTheyFight).not.toContain('\n');
      expect(l.howTheyFight.length).toBeLessThanOrEqual(200);
      expect(HEROES[l.rival.hero].side).not.toBe(side);
      expect(l.friend.hero).not.toBe(id);
      expect(HEROES[l.friend.hero].side).toBe(side);
      expect(l.rival.line.trim().length).toBeGreaterThan(10);
      expect(l.friend.line.trim().length).toBeGreaterThan(10);
    });
  }

  it('rivalries are mutual, one rival per hero', () => {
    for (const id of HERO_IDS) expect(LORE[LORE[id].rival.hero].rival.hero).toBe(id);
  });

  it('epithets are unique', () => {
    const e = HERO_IDS.map((h) => LORE[h].epithet);
    expect(new Set(e).size).toBe(e.length);
  });

  it('how-they-fight names an ability or the passive of the real kit', () => {
    // A light guard that the line was written from this hero's kit, not another's: it names the ultimate's word.
    const ult: Record<string, string> = {
      clem: 'Golden Hour', sage: 'Moonshot', brutus: 'Challenge', cacklejaw: 'Pack Hunt', lambo: 'Tangled Lights',
      aviete: 'Short Circuit', bengas: 'Curtains Up', gabe: 'Under Her Spell', meatball: 'Chonk', pixel: 'BOXBOT',
      duchess: 'Royal Decree', stilts: 'Zoomies', nugget: 'Herding Time', marshmallow: 'SNOW DAY', bravo: 'ENCORE',
      chili: 'BIG DOG', howler: 'THE SCREAM', rocket: 'ZOOM', frankie: 'FOOTLONG', domino: 'CONNECT THE DOTS',
    };
    for (const id of HERO_IDS) expect(LORE[id].howTheyFight.normalize('NFC')).toContain(ult[id]);
  });

  it('names the shelter champions in English, never with the old Lithuanian letters', () => {
    expect(LORE.gabe.hook).toContain('Gabby');
    expect(LORE.aviete.hook).toContain('Raspberry');
    expect(LORE.bengas.hook).toContain('Bengal');
    for (const id of HERO_IDS) expect(JSON.stringify(LORE[id])).not.toMatch(/\u0117|\u0307|Aviet|Gab\u0117|Bengas/);
  });
});

describe('world lore', () => {
  it('has a title, tagline, story and the match places', () => {
    expect(WORLD.title.length).toBeGreaterThan(0);
    expect(WORLD.tagline.length).toBeGreaterThan(0);
    expect(WORLD.story.length).toBeGreaterThanOrEqual(3);
    const names = WORLD.places.map((p) => p.name);
    for (const n of ['Purrhaven Isle', 'Isle of Woof', 'The Crossing', 'Pudding']) expect(names).toContain(n);
  });
});

describe('shelter champion names (Nov 2026: English in the game, plain letters for the real cats)', () => {
  it('the UI names are English; the sim data keeps its old names and the UI maps them', async () => {
    const { HEROES } = await import('../../src/data/heroes');
    const { heroDisplayName, SHELTER_CHAMPIONS } = await import('../../src/data/heroes/shelter');
    const { HERO_TEXT } = await import('../../src/ui/heroText');
    expect(Object.fromEntries(SHELTER_CHAMPIONS.map((c) => [c.hero, [c.name, c.cardName]]))).toEqual({
      lambo: ['Lambo', 'Lambo'], aviete: ['Raspberry', 'Aviete'], bengas: ['Bengal', 'Bengas'], gabe: ['Gabby', 'Gabe'],
    });
    for (const c of SHELTER_CHAMPIONS) {
      expect(heroDisplayName(c.hero, HEROES[c.hero].name)).toBe(c.name);
      expect(HERO_TEXT[c.hero].title).toBe(c.name);
      expect(c.cardName).toMatch(/^[A-Za-z]+$/);
    }
  });
});
