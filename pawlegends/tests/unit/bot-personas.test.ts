// @vitest-environment happy-dom
/**
 * Casual bot seats shown as players (founder, 2026-11-19: "while match is found, in-game shouldn't appear as BOT but
 * as generated user name, country, champ like as usual"): the persona frame is checked, the pick, loading and results
 * show a persona like a player with no "Bot" anywhere, Hide names hides it like a player, the relay's `names` keeps the
 * seat null (no report, no kudos, no profile), and a view without personas (ranked, an older relay) keeps "Bot".
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PartyView, PersonaView } from '../../src/net/proto';
import { matchPersona, matchPersonaSlots, matchPersonas, personaMap, setMatchPersonas, withPersonaNames } from '../../src/party/personas';
import { partySeats } from '../../src/ui/champSelect/seats';
import { lockedByOthers, pickHtml } from '../../src/party/ui/partyPick';
import { loadingHtml } from '../../src/party/ui/partyLoading';
import { partyRows, partyRowsHtml } from '../../src/party/ui/partyResults';
import { kudosMates } from '../../src/social/kudos';
import { reportable } from '../../src/social/report';
import { matchFlagsFor } from '../../src/social/flags';
import type { SlotStats } from '../../src/sim/api';

/** A lone player on team 1 (slot 3) against a team of bots; two personas on its own team, three on the other. */
const FILL: PersonaView[] = [
  { slot: 0, name: 'Fancy Calico', cc: 'LT', av: { i: 'h:clem' }, hero: 'clem', locked: true },
  { slot: 1, name: 'Brave Mittens', av: { i: 'h:mochi' } },
  { slot: 2, name: 'Zippy Panther', cc: 'PL', av: { i: 'h:nova' } },
  { slot: 4, name: 'Sunny Biscuit', cc: 'DE', av: { i: 'h:rex' }, hero: 'brutus', locked: true },
  { slot: 5, name: 'Witty Lynx', av: { i: 'h:chili' } },
];

const view = (over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: '',
  phase: 'pick',
  leader: 'a',
  difficulty: 'hard',
  openSeats: false,
  locked: true,
  members: [{ id: 'a', name: 'Quick Paws', guest: true, conn: 'on', slot: 3 }],
  you: 'a',
  deadlineMs: 30_000,
  mm: { side: 'dog', strangers: true, mode: 'casual', team: 1, species: ['cat', 'dog'], fill: FILL },
  ...over,
});

const stats = (slot: number, hero: string): SlotStats => ({ slot, hero, kills: 1, deaths: 2, assists: 3, heroDamage: 900 }) as unknown as SlotStats;

afterEach(() => setMatchPersonas(null));

describe('the persona frame', () => {
  it('keeps only well-formed personas: a name in the player shape, a flag, an icon, a champion', () => {
    const m = personaMap([
      ...FILL,
      { slot: 9, name: 'Out Of Range' },
      { slot: 1, name: '<img src=x>' },
      { slot: 2.5, name: 'Half Slot' },
    ] as PersonaView[], 6);
    expect([...m.keys()]).toEqual([0, 1, 2, 4, 5]);
    expect(m.get(0)).toEqual({ slot: 0, name: 'Fancy Calico', cc: 'LT', av: { i: 'h:clem' }, hero: 'clem' });
    expect(m.get(1)).toMatchObject({ cc: null, hero: null });
    expect(personaMap(null).size).toBe(0);
  });

  it('the running match keeps its personas; display names fill only the seats nobody holds', () => {
    setMatchPersonas(FILL);
    expect(matchPersona(4)?.name).toBe('Sunny Biscuit');
    expect(matchPersona(3)).toBeNull();
    expect([...matchPersonaSlots()].sort()).toEqual([0, 1, 2, 4, 5]);
    const relay = [null, null, null, 'Quick Paws', null, null];
    expect(withPersonaNames(relay, matchPersonas())).toEqual(['Fancy Calico', 'Brave Mittens', 'Zippy Panther', 'Quick Paws', 'Sunny Biscuit', 'Witty Lynx']);
    // a solo or ranked match sets none
    setMatchPersonas(undefined);
    expect(matchPersonaSlots().size).toBe(0);
  });

  it('person-only actions read the relay names, so a persona gets no report flag and no kudos', () => {
    const relay = [null, null, null, 'Quick Paws', null, 'Real Human'];
    expect(reportable(4, 3, relay)).toBe(false);
    expect(reportable(1, 3, relay)).toBe(false);
    expect(kudosMates(3, relay, 6).map((m) => m.slot)).toEqual([5]);
  });

  it('flags: a persona shows its own flag (a paw when it has none), never the seeded bot flag', () => {
    const personas = personaMap(FILL, 6);
    const relay = [0, 1, 2, 3, 4, 5].map((s) => (personas.has(s) ? personas.get(s)!.cc : s === 3 ? 'LT' : null));
    const flags = matchFlagsFor({ seed: 7, slots: 6, mySlot: 3, mine: 'LT', isHuman: (s) => s === 3 || personas.has(s), relay });
    expect(flags).toEqual(['LT', null, 'PL', 'LT', 'DE', null]);
  });
});

describe('every screen shows a persona like a player, never "Bot"', () => {
  it('champion select: the own team’s personas by name, their champion once locked', () => {
    const seats = partySeats(view(), '', (m) => m.name, 3, true);
    expect(seats.map((s) => s.name)).toEqual(['Quick Paws', 'Sunny Biscuit', 'Witty Lynx']);
    expect(seats[1]).toMatchObject({ hero: 'brutus', state: 'locked' });
    expect(seats[2]).toMatchObject({ hero: null, state: 'empty' });
    expect(seats.some((s) => s.state === 'bot')).toBe(false);
    const html = pickHtml({ view: view(), hover: 'brutus', trick: 'hiss', secondsLeft: 20, error: null });
    expect(html).toContain('Sunny Biscuit');
    expect(html).not.toMatch(/>Bot</);
    // Hide names hides a persona like any player
    expect(partySeats(view(), '', (m) => m.name, 3, true, true).map((s) => s.name)).toEqual(['Quick Paws', 'Teammate 2', 'Teammate 3']);
  });

  it('loading: both teams’ personas load as players (avatar, flag, name, champion), no "Bot" card', () => {
    const html = loadingHtml(view({ phase: 'loading' }));
    for (const p of FILL) expect(html).toContain(p.name);
    expect(html).not.toContain('pp-lc bot');
    expect(html).not.toMatch(/>Bot</);
    expect((html.match(/data-testid="loading-avatar"/g) ?? []).length).toBe(6);
    const hidden = loadingHtml(view({ phase: 'loading' }), true);
    expect(hidden).not.toContain('Sunny Biscuit');
  });

  it('results: a persona row is a player row with no bot tag; a plain bot row stays labelled', () => {
    setMatchPersonas(FILL.filter((p) => p.slot !== 5));
    const rows = partyRows({
      stats: [0, 1, 2, 3, 4, 5].map((s) => stats(s, s < 3 ? 'clem' : 'brutus')),
      mySlot: 3,
      partyNames: [null, null, null, 'Quick Paws', null, null],
      baseNames: ['a', 'b', 'c', 'Quick Paws', 'e', 'Rex'],
      pilotPct: [],
      art: [],
      hide: false,
      personas: matchPersonas(),
    });
    expect(rows.map((r) => r.name)).toEqual(['Quick Paws', 'Sunny Biscuit', 'Rex']);
    const html = partyRowsHtml(rows);
    expect((html.match(/party-result-human/g) ?? []).length).toBe(2);
    expect((html.match(/pr-tag">bot/g) ?? []).length).toBe(1);
    expect(html).toMatch(/data-slot="4" data-testid="party-result-human"/);
  });

  it('without personas (ranked, an older relay) bot seats keep saying Bot', () => {
    const v = view({ mm: { side: 'dog', strangers: true, mode: 'casual', team: 1, species: ['cat', 'dog'] } });
    expect(partySeats(v, '', (m) => m.name, 3, true).filter((s) => s.state === 'bot')).toHaveLength(2);
    expect((loadingHtml({ ...v, phase: 'loading' }).match(/pp-lc bot/g) ?? []).length).toBe(5);
  });
});

describe('a persona teammate holds its locked champion', () => {
  it('counts as taken for its own team only (the other team stays hidden), named like a player or hidden', () => {
    const t = lockedByOthers(view());
    expect(t.get('brutus')).toBe('Sunny Biscuit');
    // slot 0 is the other team's: never taken for this player
    expect(t.has('clem')).toBe(false);
    expect(lockedByOthers(view(), true).get('brutus')).toBe('Teammate 2');
    // no personas (ranked, an older relay): only members
    const mm = view().mm!;
    expect(lockedByOthers(view({ mm: { ...mm, fill: undefined } })).size).toBe(0);
  });
});
