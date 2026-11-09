// @vitest-environment happy-dom
/**
 * Lobby redesign (lobby spec §3a): the title screen names the champion after the worn Token Tails cat, Play runs the
 * stage dolly first, the bots segment follows the pickable list (locked with the "More bots" note), the keyboard
 * plays (Enter), opens the cards (C) and changes hero (H), and a player with no cards never sees an invented card.
 * Looks only: nothing here touches a number.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeLobby, firstPeekLine, heroIdentity, lobbyScreen, playLabel, playLine, questTally, type LobbyScreenOpts } from '../../src/ui/lobby/lobbyScreen';
import type { QuestView } from '../../src/meta/quests';

const base = (o: Partial<LobbyScreenOpts> = {}): LobbyScreenOpts => ({
  firstTime: false,
  last: { hero: 'clem', trick: 'pounce', difficulty: 'easy' },
  dare: null,
  muted: false,
  identity: { name: 'Simas', sub: 'Clem the Fighter', element: 'FIRE', role: 'Fighter', card: true, rung: 'LEGENDARY' },
  signedIn: false,
  difficulties: ['easy', 'normal', 'hard'],
  cardCount: 2,
  peek: [
    { name: 'Simas', element: 'FIRE', rung: 'LEGENDARY', sprite: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png' },
    { name: 'Pickles', element: 'GRASS', rung: 'COMMON' },
  ],
  wearing: { name: 'Simas' },
  onCards: vi.fn(),
  onPlay: vi.fn(),
  onChoose: vi.fn(),
  onMute: vi.fn(),
  ...o,
});

const mount = (o: LobbyScreenOpts): HTMLElement => lobbyScreen(document.body, o);
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('lobby screen', () => {
  it('names the champion after the worn card, with the hero underneath', () => {
    const root = mount(base());
    expect(root.querySelector('.lb-hero')?.textContent).toBe('Simas');
    // phones: one sub-line (the hero underneath and the card's look); desktop: the chips
    expect(root.querySelector('.lb-sub')?.textContent).toBe('Clem the Fighter · Fire look');
    expect(root.querySelector('.pl-btn.big')?.textContent).toBe('Play as Simas');
    // a returning player's name block is a button that opens the champion select
    expect(root.querySelector('.lb-name')?.getAttribute('data-a')).toBe('name');
    expect(root.querySelectorAll('[data-a="choose"]')).toHaveLength(1);
    expect(root.querySelector('.lb-chip.el')?.textContent).toContain('Fire');
    expect(root.querySelector('.pl-wearing')?.textContent).toContain('Wearing Simas');
    // one big button only (tests and the first-match helper click `.pl-btn.big`)
    expect(root.querySelectorAll('.pl-btn.big')).toHaveLength(1);
  });

  it('embedded: a "Games" button top-left leaves for the host (bridge exit); standalone has none', () => {
    expect(mount(base()).querySelector('[data-a="exit"]')).toBeNull();
    document.body.innerHTML = '';
    const onExit = vi.fn();
    const root = mount(base({ onExit }));
    const b = root.querySelector<HTMLElement>('[data-testid="lobby-exit"]');
    expect(b?.textContent).toContain('Games');
    expect(b?.getAttribute('aria-label')).toBe('Back to Token Tails games');
    b!.click();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('escapes host names', () => {
    const root = mount(base({ identity: { ...base().identity, name: '<img src=x onerror=alert(1)>' }, wearing: { name: '<b>x</b>' } }));
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.querySelector('.lb-hero')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('first time: Play as Clem, a guided line, no bots, cards or hero change', () => {
    const root = mount(base({ firstTime: true, identity: heroIdentity('clem', 'FAIRY'), firstLine: 'Your first match is a guided Rookie match.' }));
    expect(root.querySelector('.pl-btn.big')?.textContent).toBe('Play as Clem');
    expect(root.querySelector('.lb-line')?.textContent).toBe('Your first match is a guided Rookie match.');
    expect(root.querySelector('.lb-seg')).toBeNull();
    expect(root.querySelector('[data-a="choose"]')).toBeNull();
    expect(root.querySelector('[data-a="cards"]')).toBeNull();
  });

  it('Play runs the stage dolly, then starts with the picked bots', async () => {
    let done: () => void = () => undefined;
    const playOut = vi.fn(() => new Promise<void>((r) => (done = r)));
    const o = base({ playOut });
    const root = mount(o);
    (root.querySelector('[data-d="normal"]') as HTMLElement).click();
    expect(root.querySelector('.lb-line')?.textContent).toBe('3v3 vs bots');
    expect(root.querySelector<HTMLElement>('[data-a="quick"]')?.dataset.diff).toBe('· Normal');
    (root.querySelector('[data-a="quick"]') as HTMLElement).click();
    expect(playOut).toHaveBeenCalledTimes(1);
    expect(o.onPlay).not.toHaveBeenCalled();
    // a second tap during the dolly does nothing
    (root.querySelector('[data-a="quick"]') as HTMLElement).click();
    done();
    await tick();
    expect(o.onPlay).toHaveBeenCalledTimes(1);
    expect(o.onPlay).toHaveBeenCalledWith({ hero: 'clem', trick: 'pounce', difficulty: 'normal' }, undefined);
  });

  it('locked bots show the note instead of the segment', () => {
    const root = mount(base({ difficultyNote: 'More bots after 3 matches.' }));
    expect(root.querySelector('.lb-seg')).toBeNull();
    expect(root.querySelector('.lb-locked')?.textContent).toContain('More bots after 3 matches.');
  });

  it('the bots segment is one tab stop moved with the arrow keys', () => {
    const onDifficulty = vi.fn();
    const root = mount(base({ onDifficulty }));
    const seg = root.querySelector('.lb-seg') as HTMLElement;
    expect([...seg.querySelectorAll('button')].map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    seg.querySelector('button')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onDifficulty).toHaveBeenLastCalledWith('normal');
    expect(seg.querySelector('[data-d="normal"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('keyboard: Enter plays, C opens the cards, H changes hero; nothing while a dialog is open', async () => {
    const o = base();
    const root = mount(o);
    // WCAG 2.1.4: the letters do nothing while focus is outside the lobby
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    expect(o.onCards).not.toHaveBeenCalled();
    const mute = root.querySelector('[data-a="mute"]') as HTMLElement;
    mute.focus();
    mute.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    expect(o.onCards).toHaveBeenCalledTimes(1);
    mute.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    expect(o.onChoose).toHaveBeenCalledTimes(1);
    mute.blur();
    const dlg = document.createElement('div');
    dlg.setAttribute('aria-modal', 'true');
    document.body.appendChild(dlg);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    expect(o.onPlay).not.toHaveBeenCalled();
    dlg.remove();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    expect(o.onPlay).toHaveBeenCalledTimes(1);
  });

  it('no cards: a card back that opens the drawer, never an invented card, price or buy button', () => {
    const o = base({ cardCount: 0, peek: [], wearing: null, identity: heroIdentity('sage', 'WIND') });
    const root = mount(o);
    const peek = root.querySelector('.lb-peek') as HTMLElement;
    expect(peek.classList.contains('empty')).toBe(true);
    expect(peek.querySelector('.tt-card')).toBeNull();
    expect(root.textContent).not.toMatch(/\$|€|price|buy|donate/i);
    peek.click();
    expect(o.onCards).toHaveBeenCalledTimes(1);
  });

  it('the peek fans at most three cards and draws a sprite-only cat from its sheet', () => {
    const root = mount(base({ peek: [1, 2, 3, 4].map((i) => ({ name: `Cat ${i}`, element: 'ICE' as const, rung: 'RARE' as const })), cardCount: 4 }));
    expect(root.querySelectorAll('.lb-mini')).toHaveLength(3);
    const root2 = mount(base());
    expect(root2.querySelector('.lb-sprite > i')?.getAttribute('style')).toContain('a.png');
  });

  it('QA: disposeLobby removes the document key listener (redraws never pile them up)', async () => {
    const o = base();
    const root = mount(o);
    disposeLobby(root);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    expect(o.onPlay).not.toHaveBeenCalled();
    disposeLobby(root);
    disposeLobby(null);
  });

  it('QA: a first-time card owner sees the cards (not wearable yet), the guided Play stays the call', () => {
    const root = mount(base({ firstTime: true, cardCount: 5, wearing: null, identity: heroIdentity('clem', 'FAIRY') }));
    const peek = root.querySelector('.lb-peek.first') as HTMLElement;
    expect(peek).not.toBeNull();
    expect(peek.tagName).toBe('DIV');
    expect(peek.textContent).toContain('Your 5 cats are here.');
    expect(peek.textContent).toContain('Wear one after your first match.');
    expect(root.querySelectorAll('.lb-mini')).toHaveLength(2);
    expect(root.querySelector('[data-a="cards"]')).toBeNull();
    expect(root.querySelector('.pl-btn.big')?.textContent).toBe('Play as Clem');
    expect(firstPeekLine(1)).toBe('Your cat is here.');
    // no cards on a first visit: nothing
    expect(mount(base({ firstTime: true, cardCount: 0, peek: [] })).querySelector('.lb-peek')).toBeNull();
  });

  it('QA: a dare keeps the card peek', () => {
    const root = mount(base({ dare: { seed: 1, hero: 'clem', trick: 'pounce', difficulty: 'easy', seconds: 0 } as LobbyScreenOpts['dare'] }));
    expect(root.querySelector('button.lb-peek[data-a="cards"]')).not.toBeNull();
  });

  it('QA: a sprite path cannot inject CSS; bad art falls back', () => {
    const bad = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a');position:fixed;inset:0;z-index:2147483647;background:red;--x:('.png";
    const root = mount(base({ peek: [{ name: 'X', element: 'FIRE', rung: 'RARE', sprite: bad, art: "javascript:alert(1)" }] }));
    expect(root.innerHTML).not.toContain('position:fixed');
    expect(root.querySelector('img.lb-cat')).toBeNull();
    expect(root.querySelector('.lb-noart')).not.toBeNull();
    // a portrait that is not an internal data/blob URL never reaches the style attribute
    const r2 = mount(base({ frame: 'frame.legendary', portrait: 'x);background:red' }));
    expect(r2.innerHTML).not.toContain('background:red');
  });

  it('QA: the empty peek says how in its visible text (no web pointer in app builds), and the card look chip', () => {
    const web = mount(base({ cardCount: 0, peek: [], wearing: null }));
    const b = web.querySelector('.lb-peek.empty') as HTMLElement;
    expect(b.getAttribute('aria-label')).toBeNull();
    expect(b.textContent).toContain('Collect cards on Token Tails');
    const app = mount(base({ cardCount: 0, peek: [], wearing: null, isApp: true }));
    expect(app.querySelector('.lb-peek.empty')?.textContent).not.toMatch(/collect|token tails/i);
    // a card's element reads as part of its look, not a gameplay type
    expect(web.querySelector('.lb-chip.el')?.textContent).toBe('Fire look');
    expect(mount(base({ identity: heroIdentity('clem', 'FAIRY') })).querySelector('.lb-chip.el')?.textContent).toBe('Fairy');
  });

  it('QA: first visit hides the unexplained roster tier frame badge', () => {
    expect(mount(base({ firstTime: true, frame: 'frame.legendary' })).querySelector('.lb-badge')).toBeNull();
    expect(mount(base({ frame: 'frame.legendary' })).querySelector('.lb-badge')).not.toBeNull();
    // a bought frame (a restored purchase) still shows on a first visit
    expect(mount(base({ firstTime: true, frame: 'frame.founder' })).querySelector('.lb-badge')).not.toBeNull();
  });

  it('QA: on Low quality the peek front card does not move', () => {
    document.documentElement.dataset.quality = 'low';
    try {
      expect(mount(base()).querySelector('.pl-nature-live')).toBeNull();
    } finally {
      delete document.documentElement.dataset.quality;
    }
    expect(mount(base()).querySelector('.pl-nature-live')).not.toBeNull();
  });

  it('sound is a toggle button with aria-pressed', () => {
    const o = base();
    const root = mount(o);
    const b = root.querySelector('[data-a="mute"]') as HTMLElement;
    expect(b.getAttribute('aria-pressed')).toBe('true');
    b.click();
    expect(o.onMute).toHaveBeenCalledWith(true);
    expect(b.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('lobby pure helpers', () => {
  it('playLabel and playLine', () => {
    const o = base();
    expect(playLabel(o)).toBe('Play as Simas');
    expect(playLabel({ ...o, firstTime: true })).toBe('Play as Clem');
    expect(playLine(o)).toBe('3v3 vs Easy bots');
    expect(playLine({ ...o, last: { ...o.last, difficulty: 'hard' } })).toBe('3v3 vs Hard bots');
  });

  it('questTally', () => {
    const q = (done: boolean): QuestView => ({ quest: { id: 'x', text: 't', goal: 1 } as QuestView['quest'], value: done ? 1 : 0, done, fresh: false });
    expect(questTally([q(true), q(false), q(false)])).toEqual({ done: 1, total: 3 });
    expect(questTally(undefined)).toEqual({ done: 0, total: 0 });
  });

  it('heroIdentity is the hero title and "<title> the <role>"', () => {
    expect(heroIdentity('brutus', 'SAND')).toMatchObject({ name: 'Sir Brutus', sub: 'Sir Brutus the Tank', card: false });
  });
});

describe('no-scroll landing (LANDING-PICK-UX Part A)', () => {
  const quests: QuestView[] = [
    { quest: { id: 'a', text: 'Win a match', goal: 1 }, value: 1, done: true, fresh: false },
    { quest: { id: 'b', text: 'Score 3 takedowns', goal: 3 }, value: 1, done: false, fresh: false },
  ] as unknown as QuestView[];

  it('tier 3 is one rail in a fixed order, Heroes · Cards · Today · Track · Store; items the player lacks are left out', () => {
    const root = mount(base({ quests, onCollection: vi.fn(), storeOpen: true }));
    const rail = root.querySelector('.lb-rail')!;
    const items = [...rail.querySelectorAll<HTMLElement>(':scope > .lb-ri')].map((e) => e.dataset.a ?? (e.classList.contains('lb-quests') ? 'today' : ''));
    expect(items).toEqual(['choose', 'cards', 'today', 'collection', 'store']);
    expect(rail.querySelector('[data-a="cards"] .lb-count')?.textContent).toBe('2');
    expect(rail.querySelector('.lb-quests summary')?.textContent).toContain('1/2');
    document.body.innerHTML = '';
    const bare = mount(base({ onCards: undefined }));
    expect([...bare.querySelectorAll<HTMLElement>('.lb-rail > .lb-ri')].map((e) => e.dataset.a)).toEqual(['choose']);
    // the corner keeps only Games (embedded), the avatar, Settings and Sound
    expect(bare.querySelector('.lb-corner [data-a="store"], .lb-corner [data-a="collection"]')).toBeNull();
  });

  it('no rail on a first visit or during a dare; the dare hides the online row too', () => {
    expect(mount(base({ firstTime: true, onOnline: vi.fn() })).querySelector('.lb-rail')).toBeNull();
    document.body.innerHTML = '';
    const dare = mount(base({ onOnline: vi.fn(), dare: { hero: 'sage', trick: 'pounce', difficulty: 'easy', seed: 7, time: 300 } as never }));
    expect(dare.querySelector('.lb-rail')).toBeNull();
    expect(dare.querySelector('.lb-online-row')).toBeNull();
  });

  it('the name block, Heroes and H all open the champion select', () => {
    const onChoose = vi.fn();
    const root = mount(base({ onChoose }));
    (root.querySelector('.lb-name') as HTMLElement).click();
    (root.querySelector('.lb-rail [data-a="choose"]') as HTMLElement).click();
    (root.querySelector('.lb-name') as HTMLElement).focus();
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    expect(onChoose).toHaveBeenCalledTimes(3);
    disposeLobby(root);
  });

  it('the column never scrolls: no overflow-y auto anywhere in the lobby stylesheet', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync(`${process.cwd()}/src/ui/lobby/lobby.css`, 'utf8');
    expect(css).not.toMatch(/overflow-y:\s*(auto|scroll)/);
    // the hide ladder keeps its order (480, 360, 320, 280)
    const steps = [...css.matchAll(/@media \(max-height: (\d+)px\)/g)].map((m) => Number(m[1]));
    expect(steps.filter((n) => n <= 360)).toEqual([360, 320, 280]);
  });
});
