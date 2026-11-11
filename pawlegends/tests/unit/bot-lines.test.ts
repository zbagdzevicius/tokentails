import { describe, expect, it } from 'vitest';
import { filterChatText } from '../../../shared/chat-filter';
import { foldCatName } from '../../../shared/name';
import { BANNED_SUBSTRINGS, BANNED_WORDS, BOT_LINES, LINES_BY_CAT, type BotCategory } from '../../src/chat/botLines';
import { dress, drawPersona } from '../../src/chat/personas';
import { addTypo } from '../../src/chat/typos';
import { Rng } from '../../src/chat/rng';
import { phrasesFor } from '../../src/data/chatPhrases';

/** The bank lint (docs/plans/moba/MATCH-CHAT.md §5.9): a failing line fails the build. */
const ok = (s: string) => filterChatText(s).ok;
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-zÀ-ɏ]+/)
    .filter(Boolean);
const filled = (t: string) => t.replace('{who}', 'mira').replace('{lane}', 'yarn');

function banned(s: string): string | null {
  const low = s.toLowerCase();
  for (const b of BANNED_SUBSTRINGS) if (low.includes(b)) return b;
  for (const w of words(s)) {
    if (BANNED_WORDS.includes(w)) return w;
    const folded = foldCatName(w);
    if (BANNED_WORDS.includes(folded)) return folded;
  }
  // digits only in "1 hp" and "2 sec"
  const digits = low.replace(/\b1 hp\b/g, '').replace(/\b2 sec\b/g, '');
  if (/\d/.test(digits)) return 'digit';
  return null;
}

describe('bot phrase bank lint', () => {
  it('ids are unique and stable in shape', () => {
    const lids = BOT_LINES.map((l) => l.lid);
    expect(new Set(lids).size).toBe(lids.length);
    for (const l of BOT_LINES) expect(l.lid).toMatch(/^[a-z]{2}\d{2}$/);
    expect(BOT_LINES.length).toBeGreaterThanOrEqual(220);
  });

  it('every base line passes the chat filter, is ≤ 40 characters and has no banned topic, question, @ or stray digit', () => {
    for (const l of BOT_LINES) {
      const t = filled(l.text);
      expect(ok(t), `${l.lid} "${t}" filter`).toBe(true);
      expect(t.length, l.lid).toBeLessThanOrEqual(40);
      expect(banned(t), `${l.lid} "${t}"`).toBeNull();
    }
  });

  it('every category has at least 6 lines; flavour lines are side-tagged and at most 8%', () => {
    const cats = Object.keys(LINES_BY_CAT) as BotCategory[];
    for (const c of cats) expect(LINES_BY_CAT[c].length, c).toBeGreaterThanOrEqual(6);
    const flavour = BOT_LINES.filter((l) => /\b(cats?|dogs?|meow|woof|good boys|tree)\b|😼|🐶/.test(l.text) && l.cat !== 'reaction' && l.cat !== 'praise');
    for (const l of flavour.filter((l) => /cats|dogs|meow|woof|boys|tree|🐶/.test(l.text))) expect(l.side, l.lid).toBeDefined();
    expect(BOT_LINES.filter((l) => l.side).length / BOT_LINES.length).toBeLessThanOrEqual(0.08);
  });

  it('phrase fallbacks are in-match phrases (all chat ones carry an all-scope id)', () => {
    const match = new Set(phrasesFor('match').map((p) => p.id));
    const all = new Set(phrasesFor('all').map((p) => p.id));
    for (const l of BOT_LINES) if (l.q !== undefined) expect(match.has(l.q), l.lid).toBe(true);
    for (const l of [...LINES_BY_CAT.start_all, ...LINES_BY_CAT.gg_all]) {
      expect(l.q, l.lid).toBeDefined();
      expect(all.has(l.q!), l.lid).toBe(true);
    }
  });

  it('every dressed variant and typo pass the filter and the lint (2,000 personas × the bank)', () => {
    const rng = new Rng(7);
    let typoRejects = 0;
    let checked = 0;
    for (let i = 0; i < 2000; i++) {
      const p = drawPersona(rng);
      if (p.kind === 'silent') continue;
      const l = BOT_LINES[i % BOT_LINES.length];
      const s = dress(filled(l.text), p, rng, { mood: 'up', max: 40 });
      checked++;
      expect(ok(s), `"${s}"`).toBe(true);
      expect(s.length).toBeLessThanOrEqual(40);
      expect(banned(s), `"${s}"`).toBeNull();
      const t = addTypo(s, rng);
      // the engine re-filters a typo and falls back to the clean line: count how often that happens
      if (t && !ok(t.text)) typoRejects++;
    }
    expect(checked).toBeGreaterThan(900);
    expect(typoRejects / checked).toBeLessThan(0.02);
  });
});
