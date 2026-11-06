// @vitest-environment happy-dom
/**
 * Party play M1, M4, M6 (MULTIPLAYER.md §7): friends' names come from the party (never another player's custom cat
 * name, D8); Hide names and mute read "Teammate 2"; rings and the robot glyph follow the TURN mode bits; a friend
 * joining mid-match gets their name and "Mira joined"; results together show one row per human with a bot chip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { partySlotNames, teammateName } from '../../src/app/mpTypes';
import { seatsOf } from '../../src/party/partyClient';
import { MpHud } from '../../src/app/mpHud';
import { SLOT_RING } from '../../src/app/mpTypes';
import { DROP_NOTE_MS, NetHost } from '../../src/net/net-host';
import { partyRows, partyRowsHtml, againLabel } from '../../src/party/ui/partyResults';
import type { MatchMsg, PartyView, ServerJson } from '../../src/net/proto';
import type { SlotStats } from '../../src/sim/api';
import { FakeLink, fakeHost } from './mp-helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

const BASE = ['Clem', 'Biscuit the Sage', 'Rex the Lambo', 'Duke the Gabe', 'Pepper the Pixel', 'Bolt the Stilts'];

describe('teammate identity (M1)', () => {
  it('names from the party; Hide names and mute read "Teammate 2"; bots and the viewer keep theirs', () => {
    const party = ['Sunny Tabby', 'Calm Willow', null, null, null, null];
    expect(partySlotNames(BASE, party, 0)).toEqual(['Clem', 'Calm Willow', 'Rex the Lambo', ...BASE.slice(3)]);
    expect(partySlotNames(BASE, party, 1)).toEqual(['Sunny Tabby', 'Biscuit the Sage', ...BASE.slice(2)]);
    expect(partySlotNames(BASE, party, 0, { hide: true })[1]).toBe('Teammate 2');
    expect(partySlotNames(BASE, party, 0, { muted: new Set([1]) })[1]).toBe(teammateName(1));
    // a bidi override or an empty name never reaches a plate
    expect(partySlotNames(BASE, ['x', '‮', null, null, null, null], 0)[1]).toBe('Teammate 2');
  });

  it("seats: peers see the relay name; only the owner's own seat uses its custom cat name", () => {
    const v: PartyView = {
      t: 'party', code: 'K7QX2M', phase: 'match', leader: 'aaaaaa', difficulty: 'easy', openSeats: false, locked: true, you: 'bbbbbb',
      members: [
        { id: 'aaaaaa', name: 'Sunny Tabby', guest: false, conn: 'on', slot: 0, card: { image: 'https://fra1.cdn.digitaloceanspaces.com/tokentails-nfts/a.png', element: 'fire', tier: 'rare' } },
        { id: 'bbbbbb', name: 'Calm Willow', ownName: 'Simas', guest: false, conn: 'away', slot: 1 },
      ],
    };
    expect(seatsOf(v)).toEqual([
      { slot: 0, name: 'Sunny Tabby', conn: 'on', art: 'https://fra1.cdn.digitaloceanspaces.com/tokentails-nfts/a.png' },
      { slot: 1, name: 'Simas', conn: 'away', art: null },
    ]);
  });

  it('the HUD: rings on friends, a greyed robot while a bot flies them, tap a name to mute (rename + no social)', () => {
    const link = new FakeLink(0, ['Sunny Tabby', 'Calm Willow', null, null, null, null]);
    link.seats = [{ slot: 1, name: 'Calm Willow', conn: 'on', art: null }];
    const f = fakeHost(BASE);
    const hud = new MpHud(f.host, link, { hideNames: false });
    expect(f.rec.names[1]).toBe('Calm Willow');
    const plates = () => (f.host.overhead as unknown as { seats: Map<number, { ring: string; bot: boolean }> }).seats;
    expect(plates().get(1)).toEqual({ ring: SLOT_RING[1], bot: false });
    expect(plates().has(2)).toBe(false); // a bot slot
    expect(f.host.minimap.ringOf(1)).toBe(SLOT_RING[1]);
    expect(f.host.minimap.ringOf(2)).toBeNull();
    link.mask = 2;
    link.emit('mask', 2, 0);
    expect(plates().get(1)).toEqual({ ring: SLOT_RING[1], bot: true });
    expect(f.strip.get(1)).toMatchObject({ bot: true, ring: SLOT_RING[1] });
    // mute from the scoreboard
    f.sb.onMute!(1);
    expect(f.rec.names[1]).toBe('Teammate 2');
    expect(f.sb.names[1]).toBe('Teammate 2');
    link.emit('social', { slot: 1, kind: 'chat', id: 0, mine: false });
    expect(f.saidAll()).not.toContain('Nice!');
    f.sb.onMute!(1);
    link.emit('social', { slot: 1, kind: 'chat', id: 0, mine: false });
    expect(f.saidAll()).toContain('Calm Willow: Nice!');
    hud.setHide(true);
    expect(f.rec.names[1]).toBe('Teammate 2');
    hud.dispose();
  });
});

describe('NetHost party link (M1, M4)', () => {
  const match = (slot: number, names: (string | null)[]) =>
    ({ t: 'match', room: 'r', config: { seed: 5, picks: ['clem', 'sage', 'lambo', 'gabe', 'pixel', 'stilts'], tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'easy', humans: [0, 1, 2] }, cosmetics: { heroSkins: [] }, you: { slot }, names, turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 0, simVersion: 11 }) as unknown as MatchMsg;

  function rig(slot: number, names: (string | null)[]) {
    let json: ((m: ServerJson) => void) | null = null;
    let core: ((m: unknown) => void) | null = null;
    const notes: string[] = [];
    const socket = { listen: (l: { json: (m: ServerJson) => void }) => (json = l.json), sendCmd: () => undefined, sendJson: () => undefined, sendHash: () => undefined, beatNow: () => undefined, rttMs: 50, lastTurn: 0 };
    const h = new NetHost(socket as never, match(slot, names), {
      visibility: false,
      notify: (n) => notes.push(n.title),
      makeWorker: (onMsg) => {
        core = onMsg as never;
        return { post: () => undefined, close: () => undefined };
      },
    });
    const turn = (lastTurn: number, modeMask: number) => core!({ t: 'turn', lastTurn, modeMask, acks: [], B: 1, waiting: false, holds: 0 });
    return { h, json: (m: ServerJson) => json!(m), turn, notes };
  }

  it('a friend joining an open seat mid-match: their name, "Mira joined", the seat no longer a bot', () => {
    const r = rig(0, ['Sunny Tabby', null, null, null, null, null]);
    const slots: string[] = [];
    r.h.listen({ slot: (s, reason, joined) => slots.push(`${s}:${reason}:${joined}`) });
    r.json({ t: 'slot', slot: 1, reason: 'back', joined: true, name: 'Mira' });
    expect(r.h.names[1]).toBe('Mira');
    expect(r.notes).toContain('Mira joined');
    expect(slots).toEqual(['1:back:true']);
    vi.useFakeTimers();
    try {
      // a drop says so only when it lasts 2 s (the TURN mode bits still show the bot)
      r.json({ t: 'slot', slot: 1, reason: 'drop' });
      r.turn(10, 0b10);
      expect(r.notes).not.toContain('Mira dropped · bot plays');
      vi.advanceTimersByTime(DROP_NOTE_MS);
      expect(r.notes).toContain('Mira dropped · bot plays');
      r.h.nameOf = () => 'Teammate 2';
      r.json({ t: 'slot', slot: 1, reason: 'back' });
      expect(r.notes).toContain('Teammate 2 is back');
      // a blip (drop, back within 2 s) and a laggy frame say nothing at all
      const before = r.notes.length;
      r.json({ t: 'slot', slot: 1, reason: 'drop' });
      r.json({ t: 'slot', slot: 1, reason: 'back' });
      r.json({ t: 'slot', slot: 1, reason: 'drop', laggy: true });
      r.json({ t: 'slot', slot: 1, reason: 'back', laggy: true });
      vi.advanceTimersByTime(DROP_NOTE_MS * 2);
      expect(r.notes.length).toBe(before);
      // a leave is said at once
      r.json({ t: 'slot', slot: 1, reason: 'left' });
      expect(r.notes[r.notes.length - 1]).toBe('Teammate 2 left · bot plays');
    } finally {
      vi.useRealTimers();
      r.h.dispose();
    }
  });

  it('mode bits: bot share per slot, and "Bot covered for you · m:ss" when the player takes the hero back', () => {
    const r = rig(1, ['Sunny Tabby', 'Mira', null, null, null, null]);
    const masks: number[] = [];
    let covered = -1;
    r.h.listen({ mask: (m) => masks.push(m), covered: (s) => (covered = s) });
    r.turn(99, 0b110); // turns 0..99: slots 1 and 2 bot-flown
    expect(r.h.piloted(1)).toBe(true);
    r.turn(199, 0b100); // slot 1 back at turn 199 (the stretch counted from turn 99)
    expect(masks).toEqual([0b110, 0b100]);
    expect(covered).toBe(Math.round((100 * 2) / 30));
    expect(r.h.pilotPct(2)).toBe(100);
    expect(r.h.pilotPct(1)).toBe(50);
    expect(r.h.pilotPct(0)).toBe(0);
    r.h.dispose();
  });
});

describe('results together (M6)', () => {
  const st = (slot: number, hero: string, k: number): SlotStats => ({ slot, hero: hero as never, kills: k, deaths: 1, assists: 2, heroDamage: 900 + slot, towerDamage: 0, level: 7, damageTaken: 0, healShield: 0, objective: 0 });
  const stats = [st(0, 'clem', 3), st(1, 'sage', 1), st(2, 'lambo', 0), st(3, 'gabe', 2), st(4, 'pixel', 1), st(5, 'stilts', 0)];

  it('one row per teammate: two humans (a bot chip over 10%), the bot greyed, Hide names honoured', () => {
    const rows = partyRows({ stats, mySlot: 0, partyNames: ['Sunny Tabby', 'Mira', null, null, null, null], baseNames: ['Simas', ...BASE.slice(1)], pilotPct: [0, 34, 100, 0, 0, 0], art: [null, 'https://cdn.example/m.png', null, null, null, null], hide: false });
    expect(rows.map((r) => [r.name, r.human, r.me, r.botPct])).toEqual([
      ['Simas', true, true, 0],
      ['Mira', true, false, 34],
      ['Rex the Lambo', false, false, 0],
    ]);
    document.body.innerHTML = partyRowsHtml(rows);
    expect(document.querySelectorAll('[data-testid="party-result-human"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-testid="party-result-bot"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="party-bot-chip"]')?.textContent).toBe('bot 34%');
    const hidden = partyRows({ stats, mySlot: 1, partyNames: ['<b>Sunny</b>', 'Mira', null, null, null, null], baseNames: BASE, pilotPct: [5, 0, 0, 0, 0, 0], art: [], hide: true });
    expect(hidden[0].name).toBe('Teammate 1');
    expect(partyRowsHtml(hidden)).not.toContain('party-bot-chip'); // 5% is under the chip line
    // names are escaped
    const raw = partyRowsHtml(partyRows({ stats, mySlot: 1, partyNames: ['<b>Sunny</b>', 'Mira', null, null, null, null], baseNames: BASE, pilotPct: [], art: [], hide: false }));
    expect(raw).toContain('&lt;b&gt;Sunny&lt;/b&gt;');
  });

  it('"Play again together (n/m)" counts who pressed it', () => {
    const v = { members: [{ id: 'a', again: true }, { id: 'b' }, { id: 'c' }] } as unknown as PartyView;
    expect(againLabel(v, false)).toBe('Play again together (1/3)');
    expect(againLabel({ members: [{ id: 'a' }, { id: 'b' }] } as unknown as PartyView, true)).toBe('Play again together (1/2)');
  });
});
