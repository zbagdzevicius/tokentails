// @vitest-environment happy-dom
/**
 * Lobby redesign (lobby spec §3a): the title screen names the champion, Play runs the stage dolly first, the bots
 * segment follows the pickable list (locked with the "More bots" note), the keyboard plays (Enter) and changes hero
 * (H). No cards, card peek or "Games" exit (NO-TOKENTAILS.md). Looks only: nothing here touches a number.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeLobby, heroIdentity, lobbyScreen, playLabel, playLine, questTally, type LobbyScreenOpts } from '../../src/ui/lobby/lobbyScreen';
import type { QuestView } from '../../src/meta/quests';

const base = (o: Partial<LobbyScreenOpts> = {}): LobbyScreenOpts => ({
  firstTime: false,
  last: { hero: 'clem', trick: 'pounce', difficulty: 'easy' },
  dare: null,
  muted: false,
  identity: { name: 'Clem', sub: 'Clem the Fighter', element: 'FIRE', role: 'Fighter' },
  signedIn: false,
  difficulties: ['easy', 'normal', 'hard'],
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
  it('names the champion, with its role and element underneath; no card peek or Games exit', () => {
    const root = mount(base());
    expect(root.querySelector('.lb-hero')?.textContent).toBe('Clem');
    expect(root.querySelector('.lb-sub')?.textContent).toBe('Fighter · Fire');
    expect(root.querySelector('.lb-eyebrow')?.textContent).toBe('Your champion');
    expect(root.querySelector('.pl-btn.big')?.textContent).toBe('Play as Clem');
    // a returning player's name block is a button that opens the champion select
    expect(root.querySelector('.lb-name')?.getAttribute('data-a')).toBe('name');
    expect(root.querySelectorAll('[data-a="choose"]')).toHaveLength(1);
    expect(root.querySelector('.lb-chip.el')?.textContent).toBe('Fire');
    expect(root.querySelector('.lb-peek, .pl-wearing, [data-a="cards"], [data-a="exit"]')).toBeNull();
    expect(root.textContent).not.toMatch(/token ?tails|cards?\b/i);
    // one big button only (tests and the first-match helper click `.pl-btn.big`)
    expect(root.querySelectorAll('.pl-btn.big')).toHaveLength(1);
  });

  it('escapes host names', () => {
    const root = mount(base({ identity: { ...base().identity, name: '<img src=x onerror=alert(1)>' } }));
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.querySelector('.lb-hero')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('first time: Play as Clem, a guided line, no bots or hero change', () => {
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

  it('keyboard: Enter plays, H changes hero; nothing while a dialog is open', async () => {
    const o = base();
    const root = mount(o);
    // WCAG 2.1.4: the letters do nothing while focus is outside the lobby
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    expect(o.onChoose).not.toHaveBeenCalled();
    const mute = root.querySelector('[data-a="mute"]') as HTMLElement;
    mute.focus();
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

  it('QA: a portrait that is not an internal data/blob URL never reaches the style attribute', () => {
    const r2 = mount(base({ frame: 'frame.legendary', portrait: 'x);background:red' }));
    expect(r2.innerHTML).not.toContain('background:red');
  });

  it('QA: first visit hides the unexplained roster tier frame badge', () => {
    expect(mount(base({ firstTime: true, frame: 'frame.legendary' })).querySelector('.lb-badge')).toBeNull();
    expect(mount(base({ frame: 'frame.legendary' })).querySelector('.lb-badge')).not.toBeNull();
    // a bought frame (a restored purchase) still shows on a first visit
    expect(mount(base({ firstTime: true, frame: 'frame.founder' })).querySelector('.lb-badge')).not.toBeNull();
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
    expect(playLabel(o)).toBe('Play as Clem');
    expect(playLabel({ ...o, identity: heroIdentity('sage', 'WIND') })).toBe('Play as Sage');
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
    expect(heroIdentity('brutus', 'SAND')).toEqual({ name: 'Sir Brutus', sub: 'Sir Brutus the Tank', element: 'SAND', role: 'Tank' });
  });
});

describe('no-scroll landing (LANDING-PICK-UX Part A)', () => {
  const quests: QuestView[] = [
    { quest: { id: 'a', text: 'Win a match', goal: 1 }, value: 1, done: true, fresh: false },
    { quest: { id: 'b', text: 'Score 3 takedowns', goal: 3 }, value: 1, done: false, fresh: false },
  ] as unknown as QuestView[];

  it('tier 3 is one rail in a fixed order, Heroes · Today · Track · Store; items the player lacks are left out', () => {
    const root = mount(base({ quests, onCollection: vi.fn(), storeOpen: true }));
    const rail = root.querySelector('.lb-rail')!;
    const items = [...rail.querySelectorAll<HTMLElement>(':scope > .lb-ri')].map((e) => e.dataset.a ?? (e.classList.contains('lb-quests') ? 'today' : ''));
    expect(items).toEqual(['choose', 'today', 'collection', 'store']);
    expect(rail.querySelector('.lb-quests summary')?.textContent).toContain('1/2');
    document.body.innerHTML = '';
    const bare = mount(base());
    expect([...bare.querySelectorAll<HTMLElement>('.lb-rail > .lb-ri')].map((e) => e.dataset.a)).toEqual(['choose']);
    // the corner keeps only the avatar, Settings and Sound
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
