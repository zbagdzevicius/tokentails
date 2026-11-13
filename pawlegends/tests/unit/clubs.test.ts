// @vitest-environment happy-dom
/**
 * Clubs and good-teammate kudos (docs/plans/moba/CLUBS-KUDOS.md): the game's mirror equals the server contracts, the
 * Clubs tab creates with a generated name (never typed text), joins by code, opens the club chest and the club chat,
 * names go through textContent, and the results row sends one `kudos.give` per teammate.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { API_OPS } from '../../src/embed/api';
import * as game from '../../src/social/clubs/clubData';
import * as server from '../../../backend/src/pawlegends/clubs/clubs.contracts';
import { chestBarHtml } from '../../src/social/clubs/clubsPanel';
import { kudosMates, kudosOutcome, mountKudos } from '../../src/social/kudos';
import { SocialSheet } from '../../src/social/socialSheet';

afterEach(() => {
  document.body.innerHTML = '';
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('club data mirrors the server', () => {
  it('limits, tiers and name lists are the same', () => {
    expect(game.CLUB_LIMITS).toEqual(server.CLUB_LIMITS);
    expect(game.CLUB_CHEST_TIERS).toEqual(server.CLUB_CHEST_TIERS);
    expect(game.KUDOS_CHEST_TIERS).toEqual(server.KUDOS_CHEST_TIERS);
    expect(game.CLUB_NAME_FIRST).toEqual(server.CLUB_NAME_FIRST);
    expect(game.CLUB_NAME_SECOND).toEqual(server.CLUB_NAME_SECOND);
    expect(game.clubNameText(3, 7)).toBe(server.clubNameText(3, 7));
  });

  it('a rolled name is what the server parses', () => {
    for (const r of [0, 0.3, 0.99999]) {
      const n = game.rollClubName(() => r);
      expect(server.parseClubName(game.clubNameArg(n))).toEqual(n);
    }
  });

  it('codes normalise like the server', () => {
    for (const c of ['cl-7kq2m9', 'CL 7KQ2MO', '7kq2m9']) expect(game.normalClubCode(c)).toBe(`CL-${server.parseClubCode(c)}`);
    expect(game.normalClubCode('CL-7KQ')).toBeNull();
  });

  it('the op list carries the club and kudos ops', () => {
    for (const op of ['club.get', 'club.create', 'club.join', 'club.leave', 'club.remove', 'club.claim', 'kudos.give']) expect(API_OPS).toContain(op);
  });

  it('next tier, countdown and the bar', () => {
    expect(game.nextTier([8, 20, 40], 9)).toEqual({ need: 20, have: 9, index: 1 });
    expect(game.nextTier([8, 20, 40], 40)).toBeNull();
    expect(game.untilText(3 * 86_400_000 + 4 * 3_600_000)).toBe('3d 4h');
    expect(game.untilText(30_000)).toBe('1m');
    const bar = chestBarHtml(20, [8, 20, 40], 'Club chest');
    expect(bar).toContain('width:50%');
    expect((bar.match(/pl-club-pip on/g) ?? []).length).toBe(2);
    expect((bar.match(/pl-club-tick on/g) ?? []).length).toBe(2);
  });
});

const club = (over: Partial<game.ClubView> = {}): game.ClubView => ({
  code: 'CL-7KQ2M9',
  name: 'Swift Comets',
  size: 3,
  cap: 30,
  owner: true,
  thread: `c${'a'.repeat(22)}`,
  tier: 'text',
  members: [
    { mid: 'aaaaaaaaaaaa', name: 'Sunny Tabby', owner: true, you: true, wins: 2 },
    { mid: 'bbbbbbbbbbbb', name: '<img src=x onerror=alert(1)>', owner: false, you: false, wins: 0 },
    { mid: 'cccccccccccc', name: 'Brave Paws', owner: false, you: false, wins: 7 },
  ],
  chest: { week: '2026-W46', endsAt: new Date(Date.now() + 86_400_000).toISOString(), wins: 9, tiers: [8, 20, 40], claimed: [], open: 1, mine: 2, perDay: 6, next: { id: 'title.s1.rookie', name: 'Rookie Legend title' } },
  ...over,
});
const kudos: game.KudosView = { month: '2026-11', endsAt: '2026-12-01T00:00:00.000Z', n: 2, tiers: [3, 8, 15], paid: [], got: [], next: { id: 'x', name: 'Honey Tabby coat' } };

function sheet(start: game.ClubView | null) {
  let current: game.ClubView | null = start;
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const api = vi.fn(async (op: string, args: Record<string, unknown> = {}): Promise<ApiResult> => {
    calls.push({ op, args });
    if (op === 'social.get') return { id: 'x', ok: true, status: 200, body: { me: { code: 'PL-7KQ2-M9XR', name: 'Me', invisible: false, allowRecent: true, ageBand: '18+' }, friends: [], requests: { in: [], out: [] }, blocks: [], invites: [], rev: 'r' } };
    if (op === 'club.create' || op === 'club.join') current = club({ size: 1 });
    if (op === 'club.leave') current = null;
    if (op === 'club.claim') return { id: 'x', ok: true, status: 200, body: { club: club({ chest: { ...club().chest, open: 0, claimed: [0] } }), kudos, got: [{ id: 'title.s1.rookie', name: 'Rookie Legend title' }] } };
    if (op.startsWith('club.')) return { id: 'x', ok: true, status: 200, body: { club: current, kudos } };
    if (op === 'chat.history') return { id: 'x', ok: true, status: 200, body: { thread: { tier: 'text' }, messages: [{ mid: 'a'.repeat(24), mine: false, k: 'q', id: 5, at: Date.now(), who: 'Brave Paws' }], more: false } };
    return { id: 'x', ok: true, status: 200, body: {} };
  });
  const s = new SocialSheet(document.body, { api: api as never, signedIn: () => true, partyCode: () => null, joinParty: vi.fn(), signIn: vi.fn(), playCasual: vi.fn(), height: () => 375 }, 'clubs');
  return { s, calls };
}

describe('clubs tab', () => {
  it('no club: a generated name, reroll, Create sends the two list positions', async () => {
    const { s, calls } = sheet(null);
    await flush();
    const name = s.root.querySelector('[data-testid="club-name"]')!.textContent!;
    expect(name.split(' ')).toHaveLength(2);
    expect(s.root.querySelector('[data-tab="clubs"]')!.getAttribute('aria-selected')).toBe('true');
    (s.root.querySelector('[data-testid="club-create"]') as HTMLElement).click();
    await flush();
    const create = calls.find((c) => c.op === 'club.create')!;
    expect(String(create.args.name)).toMatch(/^\d{1,2}\.\d{1,2}$/);
    expect(s.root.querySelector('[data-testid="club-card"]')).not.toBeNull();
    // there is no text input for a club name anywhere
    expect(s.root.querySelector('input[name="clubname"]')).toBeNull();
  });

  it('join by code: the typed code is normalised; a bad code never calls the server', async () => {
    const { s, calls } = sheet(null);
    await flush();
    const input = s.root.querySelector<HTMLInputElement>('[data-testid="club-code"]')!;
    input.value = 'nope';
    input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(calls.some((c) => c.op === 'club.join')).toBe(false);
    s.root.querySelector<HTMLInputElement>('[data-testid="club-code"]')!.value = 'cl 7kq2m9';
    s.root.querySelector<HTMLInputElement>('[data-testid="club-code"]')!.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(calls.find((c) => c.op === 'club.join')?.args).toEqual({ code: 'CL-7KQ2M9' });
  });

  it('in a club: chest, claim, members (names by textContent), owner remove needs a second tap, leave arms first', async () => {
    const { s, calls } = sheet(club());
    await flush();
    expect(s.root.querySelector('[data-testid="club-code-text"]')!.textContent).toBe('CL-7KQ2M9');
    expect(s.root.querySelector('[data-testid="club-kudos"]')!.textContent).toContain('2/3');
    (s.root.querySelector('[data-testid="club-claim"]') as HTMLElement).click();
    await flush();
    expect(calls.some((c) => c.op === 'club.claim')).toBe(true);
    expect(s.root.textContent).toContain('Rookie Legend title');
    (s.root.querySelector('[data-testid="club-members"]') as HTMLElement).click();
    expect(s.root.querySelectorAll('[data-testid="club-member"]')).toHaveLength(3);
    expect(s.root.querySelector('[onerror]')).toBeNull();
    expect(s.root.textContent).toContain('<img src=x onerror=alert(1)>');
    const rm = () => s.root.querySelector<HTMLElement>('[data-club="remove"][data-mid="bbbbbbbbbbbb"]')!;
    rm().click();
    expect(calls.some((c) => c.op === 'club.remove')).toBe(false);
    rm().click();
    await flush();
    expect(calls.find((c) => c.op === 'club.remove')?.args).toEqual({ to: 'bbbbbbbbbbbb' });
    (s.root.querySelector('[data-club="back"]') as HTMLElement).click();
    (s.root.querySelector('[data-testid="club-leave"]') as HTMLElement).click();
    expect(calls.some((c) => c.op === 'club.leave')).toBe(false);
    (s.root.querySelector('[data-testid="club-leave"]') as HTMLElement).click();
    await flush();
    expect(calls.some((c) => c.op === 'club.leave')).toBe(true);
    expect(s.root.querySelector('[data-testid="club-create"]')).not.toBeNull();
  });

  it('club chat opens the club thread directly, with sender names and no Block', async () => {
    const { s, calls } = sheet(club());
    await flush();
    (s.root.querySelector('[data-testid="club-chat"]') as HTMLElement).click();
    await flush();
    expect(calls.some((c) => c.op === 'chat.open')).toBe(false);
    expect(calls.find((c) => c.op === 'chat.history')?.args.thread).toBe(club().thread);
    const chat = document.querySelector('.pl-chat')!;
    expect(chat.querySelector('.pl-chat-who')!.textContent).toBe('Brave Paws');
    (chat.querySelector('[data-a="menu"]') as HTMLElement).click();
    expect(chat.querySelector('[data-a="block"]')).toBeNull();
    expect(chat.querySelector('[data-a="mute"]')).not.toBeNull();
  });
});

describe('kudos on the PvP results', () => {
  it('teammates only: named seats on my team, never me', () => {
    const names = ['Me', 'Ally', null, 'Foe', 'Foe 2', null];
    expect(kudosMates(0, names, 6)).toEqual([{ slot: 1, name: 'Ally' }]);
    const ten = ['A', 'B', 'C', null, 'E', 'F', 'G', null, null, null];
    expect(kudosMates(0, ten, 10).map((m) => m.slot)).toEqual([1, 2, 4]);
    expect(kudosMates(5, ten, 10).map((m) => m.slot)).toEqual([6]);
  });

  it('outcomes: sent, party mate, failed', () => {
    expect(kudosOutcome({ id: 'x', ok: true, status: 200 })).toBe('sent');
    expect(kudosOutcome({ id: 'x', ok: false, status: 403, body: { code: 'PAWLEGENDS_KUDOS_PREMADE' } })).toBe('premade');
    expect(kudosOutcome({ id: 'x', ok: false, status: 0 })).toBe('failed');
  });

  it('one tap sends one kudos.give; a failure frees the button again', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-slot="kudos"></div>';
    document.body.appendChild(root);
    let ok = false;
    const send = vi.fn(async () => ({ id: 'x', ok, status: ok ? 200 : 0 }) as ApiResult);
    mountKudos(root, { mates: [{ slot: 1, name: '<b>Ally</b>' }], send });
    const b = root.querySelector<HTMLButtonElement>('[data-kudos="1"]')!;
    expect(b.textContent).toContain('<b>Ally</b>');
    b.click();
    b.click();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(b.disabled).toBe(false);
    ok = true;
    b.click();
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(b.disabled).toBe(true);
    expect(b.classList.contains('done')).toBe(true);
  });

  it('no slot or no teammate: nothing renders', () => {
    const root = document.createElement('div');
    expect(mountKudos(root, { mates: [{ slot: 1, name: 'A' }], send: vi.fn() })).toBeNull();
    root.innerHTML = '<div data-slot="kudos"></div>';
    expect(mountKudos(root, { mates: [], send: vi.fn() })).toBeNull();
  });
});
