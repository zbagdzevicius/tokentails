// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { lobbyHtml, shownName, type LobbyModel } from '../../src/party/ui/partyLobby';
import { decoratePick, heroBlock, pickHtml } from '../../src/party/ui/partyPick';
import { loadingHtml } from '../../src/party/ui/partyLoading';
import { codeLetters, joinCodeHtml, wireCodeBoxes } from '../../src/party/ui/joinCode';
import type { PartyView } from '../../src/net/proto';

/* Party play P4, P5, P7, P8 (MULTIPLAYER.md §8): the pre-match screens in a DOM. */

const ART = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/cats/a.gif';
const view = (over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: 'K7QX2M',
  phase: 'lobby',
  leader: 'a',
  difficulty: 'normal',
  openSeats: false,
  locked: false,
  members: [
    { id: 'a', name: 'Sunny Tabby', guest: false, conn: 'on', card: { image: ART, element: 'fire', tier: 'rare', catId: 'c1' }, ownName: 'Sir Fluff' },
    { id: 'b', name: '<img src=x onerror=alert(1)>', guest: true, conn: 'away', newbie: true },
  ],
  you: 'a',
  ...over,
});
const model = (v: PartyView, over: Partial<LobbyModel> = {}): LobbyModel => ({ view: v, qr: '<svg class="pp-qr-svg"></svg>', error: null, startAnyway: false, nudged: new Set(), difficulties: ['easy', 'normal', 'hard'], ...over });
const mount = (html: string): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.replaceChildren(el);
  return el;
};

describe('party lobby (P4)', () => {
  it('three seats: two members and an Invite seat; the code is shown as K7Q X2M', () => {
    const el = mount(lobbyHtml(model(view())));
    expect(el.querySelectorAll('[data-testid="party-seat"]')).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid="party-seat-empty"]')).toHaveLength(1);
    expect(el.querySelector('[data-testid="party-code"]')!.textContent).toBe('K7Q X2M');
    expect(el.querySelector('.pp-seat.empty [data-p="share"]')).not.toBeNull();
  });

  it('names are escaped; the owner sees its own custom cat name, peers the generated one', () => {
    const el = mount(lobbyHtml(model(view())));
    expect(el.querySelector('img[src="x"]')).toBeNull();
    const names = [...el.querySelectorAll('.pp-who b')].map((b) => b.textContent);
    expect(names).toEqual(['Sir Fluff', '<img src=x onerror=alert(1)>']);
    const peer = mount(lobbyHtml(model(view({ you: 'b' }))));
    expect(peer.textContent).not.toContain('Sir Fluff');
    expect(peer.textContent).toContain('Sunny Tabby');
  });

  it('badges: the leader crown, you, guest, new; the card art from the bucket only', () => {
    const el = mount(lobbyHtml(model(view())));
    const [a, b] = el.querySelectorAll('[data-testid="party-seat"]');
    expect(a.querySelector('.pp-crown')).not.toBeNull();
    expect(a.querySelector('.pp-tag.me')).not.toBeNull();
    expect((a.querySelector('.pp-av') as HTMLElement).getAttribute('style')).toContain(ART);
    expect(b.querySelector('.pp-crown')).toBeNull();
    expect(b.textContent).toContain('guest');
    expect(b.querySelector('.pp-tag.new')).not.toBeNull();
    expect(b.getAttribute('data-conn')).toBe('away');
    const bad = view();
    bad.members[0].card!.image = 'https://evil.example/x.gif';
    expect(mount(lobbyHtml(model(bad))).innerHTML).not.toContain('evil.example');
  });

  it('leader controls: difficulty, Open seats, Lock party, New code, kick and lead, Start', () => {
    const el = mount(lobbyHtml(model(view())));
    expect(el.querySelectorAll('[data-p="diff"]')).toHaveLength(3);
    expect(el.querySelector('[data-p="diff"][aria-checked="true"]')!.textContent).toBe('Normal');
    expect(el.querySelector('input[data-p="open"]')).not.toBeNull();
    expect(el.querySelector('input[data-p="lock"]')).not.toBeNull();
    expect(el.querySelector('[data-p="newcode"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-p="kick"]')).toHaveLength(1);
    expect(el.querySelector('[data-p="kick"]')!.getAttribute('data-m')).toBe('b');
    expect(el.querySelector('[data-testid="party-start"]')!.textContent).toBe('Start');
    expect(el.querySelector('[data-testid="party-newbie"]')!.textContent).toBe('New player in party');
  });

  it('members see no leader controls: "Leader picks" and "Waiting for leader"', () => {
    const el = mount(lobbyHtml(model(view({ you: 'b' }))));
    expect(el.querySelector('[data-p="diff"]')).toBeNull();
    expect(el.querySelector('input[data-p="open"]')).toBeNull();
    expect(el.querySelector('[data-p="kick"]')).toBeNull();
    expect(el.querySelector('[data-p="newcode"]')).toBeNull();
    expect(el.querySelector('[data-testid="party-start"]')).toBeNull();
    expect(el.querySelector('[data-testid="party-leader-picks"]')!.textContent).toBe('Leader picks: Normal');
    expect(el.querySelector('[data-testid="party-wait-leader"]')).not.toBeNull();
  });

  it('a party of one says Play (a local solo match); Open seats shows its notes', () => {
    const solo = view({ members: [view().members[0]] });
    expect(mount(lobbyHtml(model(solo))).querySelector('[data-testid="party-start"]')!.textContent).toBe('Play');
    const open = mount(lobbyHtml(model({ ...solo, openSeats: true })));
    expect(open.querySelector('[data-testid="party-start"]')!.textContent).toBe('Start');
    expect(open.textContent).toContain('Bots get the human buff while seats are open');
    expect(open.textContent).toContain('Unfilled seats lower rewards');
  });

  it('the waiting chip: "Waiting for <name> · Nudge", then Nudged; Start anyway after 10 s', () => {
    const v = view({ waiting: ['b'] });
    const el = mount(lobbyHtml(model(v)));
    const chip = el.querySelector('[data-testid="party-waiting"]')!;
    expect(chip.textContent).toContain('Waiting for <img src=x onerror=alert(1)>');
    expect(chip.querySelector('[data-p="nudge"]')!.textContent).toBe('Nudge');
    const after = mount(lobbyHtml(model(v, { nudged: new Set(['b']), startAnyway: true })));
    expect((after.querySelector('[data-p="nudge"]') as HTMLButtonElement).disabled).toBe(true);
    expect(after.querySelector('[data-testid="party-start"]')!.textContent).toBe('Start anyway');
  });

  it('results: Play again together for the leader and the members', () => {
    expect(mount(lobbyHtml(model(view({ phase: 'results' })))).querySelector('[data-p="rematch"]')!.textContent).toBe('Play again together');
    expect(mount(lobbyHtml(model(view({ phase: 'results', you: 'b' })))).querySelector('[data-p="rematch"]')).not.toBeNull();
  });

  it('Hide names: peers show as "Teammate n"', () => {
    const v = view();
    expect(shownName(v, v.members[1], true)).toBe('Teammate 2');
    expect(shownName(v, v.members[0], true)).toBe('Sir Fluff');
  });

  it('errors are escaped text', () => {
    expect(mount(lobbyHtml(model(view(), { error: '<b>x</b>' }))).querySelector('.pp-err')!.textContent).toBe('<b>x</b>');
  });
});

describe('shared pick (P7)', () => {
  const pick = (over: Partial<PartyView> = {}) =>
    view({
      phase: 'pick',
      deadlineMs: 20_000,
      members: [
        { id: 'a', name: 'Sunny Tabby', guest: false, conn: 'on', slot: 0, hero: 'clem', locked: true },
        { id: 'b', name: 'Brave Sage', guest: false, conn: 'on', slot: 1, hero: 'sage', newbie: true },
      ],
      you: 'b',
      ...over,
    });

  it('a hero another human locked is greyed with their name', () => {
    const v = pick();
    const el = mount(pickHtml({ view: v, hover: 'sage', trick: 'pounce', secondsLeft: 20, error: null }));
    decoratePick(el, v);
    const clem = el.querySelector('[data-testid="party-hero-clem"]') as HTMLButtonElement;
    expect(clem.disabled).toBe(true);
    expect(clem.querySelector('.pp-taken')!.textContent).toBe('Sunny Tabby');
    expect(heroBlock(v, 'clem')).toBe('Sunny Tabby');
  });

  it("the other side is greyed with \"Leader chose cats\"; the leader may pick any side", () => {
    const v = pick();
    const el = mount(pickHtml({ view: v, hover: 'sage', trick: 'pounce', secondsLeft: 20, error: null }));
    decoratePick(el, v);
    expect(el.querySelector('.pp-heroes[data-side="dog"]')!.getAttribute('data-dim')).toBe('1');
    expect(el.querySelector('.pp-side-note')!.textContent).toBe('Leader chose cats');
    expect(heroBlock(v, 'brutus')).toBe('Leader chose cats');
    expect(heroBlock({ ...v, you: 'a' }, 'brutus')).toBe('');
  });

  it('the team strip: humans by slot, a bot seat as "?", hover and lock states', () => {
    const el = mount(pickHtml({ view: pick(), hover: 'sage', trick: 'pounce', secondsLeft: 20, error: null }));
    const seats = el.querySelectorAll('.pp-ts');
    expect(seats).toHaveLength(3);
    expect(seats[0].getAttribute('data-locked')).toBe('true');
    expect(seats[1].getAttribute('data-hover')).toBe('true');
    expect(seats[2].classList.contains('bot')).toBe(true);
    expect(el.querySelector('[data-testid="party-timer"]')!.textContent).toBe('20s');
  });

  it('a newbie sees "New? Try this" on the easy hero when it is free', () => {
    const v = pick({ members: [{ id: 'a', name: 'A', guest: false, conn: 'on', slot: 0, hero: 'sage' }, { id: 'b', name: 'B', guest: false, conn: 'on', slot: 1, newbie: true }] });
    const el = mount(pickHtml({ view: v, hover: 'clem', trick: 'pounce', secondsLeft: 20, error: null }));
    decoratePick(el, v);
    expect(el.querySelector('[data-testid="party-hero-clem"] .pp-try')!.textContent).toBe('New? Try this');
  });

  it('locked in: every hero and trick is disabled and the button says so', () => {
    const v = pick({ you: 'a' });
    const el = mount(pickHtml({ view: v, hover: 'clem', trick: 'pounce', secondsLeft: 20, error: null }));
    decoratePick(el, v);
    expect([...el.querySelectorAll<HTMLButtonElement>('[data-p="hero"]')].every((b) => b.disabled)).toBe(true);
    expect([...el.querySelectorAll<HTMLButtonElement>('[data-p="trick"]')].every((b) => b.disabled)).toBe(true);
    expect(el.querySelector('[data-testid="party-lock"]')!.textContent).toBe('Locked in');
  });
});

describe('loading (P8)', () => {
  it('humans named with load bars; a late member is covered by a bot after the deadline', () => {
    const v = view({
      phase: 'loading',
      deadlineMs: 0,
      members: [
        { id: 'a', name: 'Sunny Tabby', guest: false, conn: 'on', slot: 0, hero: 'clem', loadPct: 100 },
        { id: 'b', name: 'Mira Cat', guest: false, conn: 'on', slot: 1, hero: 'sage', loadPct: 30 },
      ],
    });
    const el = mount(loadingHtml(v));
    expect(el.querySelectorAll('.pp-lc:not(.bot)')).toHaveLength(2);
    expect(el.querySelector('.pp-lc.bot')).not.toBeNull();
    expect(el.textContent).toContain('Bot covers until Mira Cat loads');
    expect(el.querySelectorAll('[role="progressbar"]')[1].getAttribute('aria-valuenow')).toBe('30');
  });
});

describe('join by code (P5)', () => {
  it('folds case, drops letters outside the alphabet, reads a pasted link', () => {
    expect(codeLetters('k7q x2m')).toBe('K7QX2M');
    expect(codeLetters('k7q-x2m')).toBe('K7QX2M');
    expect(codeLetters('O0I1L')).toBe('');
    expect(codeLetters('https://tokentails.com/pawlegends?party=k7qx2m&x=1')).toBe('K7QX2M');
  });

  it('typing auto-advances; a paste fills every box and joins', () => {
    const el = mount(joinCodeHtml(null));
    const joined: string[] = [];
    wireCodeBoxes(el, (c) => joined.push(c));
    const boxes = [...el.querySelectorAll<HTMLInputElement>('.pp-box')];
    expect(boxes).toHaveLength(6);
    boxes[0].value = 'k';
    boxes[0].dispatchEvent(new Event('input'));
    expect(boxes[0].value).toBe('K');
    expect(document.activeElement).toBe(boxes[1]);
    const paste = new Event('paste', { cancelable: true }) as Event & { clipboardData: { getData(): string } };
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'k7q x2m' } });
    boxes[0].dispatchEvent(paste);
    expect(boxes.map((b) => b.value).join('')).toBe('K7QX2M');
    expect(joined).toEqual(['K7QX2M']);
  });

  it('inline errors under the boxes', () => {
    expect(mount(joinCodeHtml('This party has ended')).querySelector('[data-testid="party-join-error"]')!.textContent).toBe('This party has ended');
  });
});
