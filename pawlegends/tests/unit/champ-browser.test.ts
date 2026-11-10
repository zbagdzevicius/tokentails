// @vitest-environment happy-dom
/**
 * Champion browser (src/ui/champBrowser/): the hero page with Skills and Lore tabs, the "i" on every pick card, the
 * pick screen's Select, and the in-match long-press skill peek. The clip player is a stand-in (no WebGL here): the
 * tests check which hero and skill it is asked to play, that a skill tap plays at once, that the passive and the
 * basic attack show the still, and that closing disposes it. The words come from the codex and the lore (their own
 * tests check them against the data); here they must reach the page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import type { HeroId } from '../../src/data/heroes/types';
import { LORE } from '../../src/data/lore';
import { heroCodex, SKILL_SLOTS, skillCard } from '../../src/ui/skillCodex';
import { HERO_TEXT } from '../../src/ui/heroText';
import { openChampBrowser, openBrowser, SWIPE, type ClipFactory, type ClipPlayer } from '../../src/ui/champBrowser/champBrowser';
import { BROWSE_ORDER, DIFFICULTY_NAME, HERO_DIFFICULTY, stepHero } from '../../src/ui/champBrowser/meta';
import { skillCardHtml } from '../../src/ui/champBrowser/cardView';
import { attachSkillPeek, peekHtml, PEEK, slotOfButton } from '../../src/ui/champBrowser/skillPeek';
import { pickScreen, type PickOpts } from '../../src/ui/screens';
import { pickHtml } from '../../src/party/ui/partyPick';
import type { PartyView } from '../../src/net/proto';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

interface FakeClips {
  factory: ClipFactory;
  log: string[];
  players: (ClipPlayer & { playing: boolean; disposed: boolean; at: string })[];
}
function fakeClips(): FakeClips {
  const log: string[] = [];
  const players: FakeClips['players'] = [];
  const factory: ClipFactory = (el, hero, slot) => {
    log.push(`mount ${hero}:${slot}`);
    const c = document.createElement('canvas');
    el.appendChild(c);
    const p = {
      ready: Promise.resolve(),
      playing: false,
      disposed: false,
      at: `${hero}:${slot}`,
      play() {
        p.playing = true;
      },
      stop() {
        p.playing = false;
      },
      set(h: HeroId, s: 'q' | 'w' | 'e' | 'r') {
        log.push(`set ${h}:${s}`);
        p.at = `${h}:${s}`;
        return Promise.resolve();
      },
      dispose() {
        p.disposed = true;
        c.remove();
        log.push('dispose');
      },
    };
    players.push(p);
    return p;
  };
  return { factory, log, players };
}

const click = (el: Element | null): void => {
  if (!el) throw new Error('missing element');
  (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};
const key = (k: string, target: EventTarget = document.body): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};

afterEach(() => {
  openBrowser()?.close();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.skillPeek;
});

describe('champion browser data', () => {
  it('every hero has a difficulty, and the browse order is every hero, cats then dogs', () => {
    for (const h of HERO_IDS) expect([1, 2, 3]).toContain(HERO_DIFFICULTY[h]);
    expect([...BROWSE_ORDER].sort()).toEqual([...HERO_IDS].sort());
    const firstDog = BROWSE_ORDER.findIndex((h) => HEROES[h].side === 'dog');
    expect(BROWSE_ORDER.slice(0, firstDog).every((h) => HEROES[h].side === 'cat')).toBe(true);
    expect(BROWSE_ORDER.slice(firstDog).every((h) => HEROES[h].side === 'dog')).toBe(true);
    // the guided first-match hero is the easiest
    expect(HERO_DIFFICULTY.clem).toBe(1);
  });
  it('stepHero wraps both ways and starts a hero missing from the list at its front', () => {
    const o: HeroId[] = ['clem', 'sage', 'brutus'];
    expect(stepHero(o, 'clem', -1)).toBe('brutus');
    expect(stepHero(o, 'brutus', 1)).toBe('clem');
    expect(stepHero(o, 'howler', 1)).toBe('sage');
  });
});

describe('champion browser', () => {
  it('opens on Skills with Q playing at once, in the hero header the name, epithet, side, role, attack and difficulty', async () => {
    const f = fakeClips();
    const b = openChampBrowser({ hero: 'sage', clips: f.factory });
    await flush();
    const r = b.root;
    expect(r.getAttribute('role')).toBe('dialog');
    expect(r.getAttribute('aria-modal')).toBe('true');
    expect(r.querySelector('.cb-name')?.textContent).toBe(HERO_TEXT.sage.title);
    expect(r.querySelector('.cb-epithet')?.textContent).toBe(LORE.sage.epithet);
    const chips = r.querySelector('.cb-chips')?.textContent ?? '';
    expect(chips).toContain('Cat');
    expect(chips).toContain(HERO_TEXT.sage.role);
    expect(chips).toContain('Ranged');
    expect(chips).toContain(DIFFICULTY_NAME[HERO_DIFFICULTY.sage]);
    expect(r.dataset.tab).toBe('skills');
    expect(b.slot()).toBe('q');
    expect(f.log).toEqual(['mount sage:q']);
    expect(f.players[0]?.playing).toBe(true);
    expect(r.dataset.clip).toBe('playing');
    // six skill buttons in codex order, Q selected
    const btns = [...r.querySelectorAll<HTMLElement>('.cb-skill-btn')];
    expect(btns.map((x) => x.dataset.slot)).toEqual([...SKILL_SLOTS]);
    expect(r.querySelector('.cb-skill-btn.on')?.getAttribute('data-slot')).toBe('q');
    expect(r.querySelector('.cb-card')?.textContent).toContain(skillCard('sage', 'q').name);
  });

  it('a skill tap plays its clip on the same player; the passive and basic attack show the still', async () => {
    const f = fakeClips();
    const b = openChampBrowser({ hero: 'clem', clips: f.factory });
    await flush();
    click(b.root.querySelector('.cb-skill-btn[data-slot="r"]'));
    await flush();
    expect(f.log).toEqual(['mount clem:q', 'set clem:r']);
    expect(b.root.dataset.clip).toBe('playing');
    const card = b.root.querySelector('.cb-card')?.textContent ?? '';
    const r = skillCard('clem', 'r');
    expect(card).toContain(r.name);
    expect(card).toContain(r.what);
    expect(card).toContain('Unlocks at level 4');
    for (const fact of r.facts) expect(card).toContain(fact.value);
    expect(card).toContain(r.tip);
    expect(card).toContain(r.counter);
    click(b.root.querySelector('.cb-skill-btn[data-slot="passive"]'));
    await flush();
    expect(b.root.dataset.clip).toBe('none');
    expect(f.players[0]?.playing).toBe(false);
    expect(b.root.querySelector('.cb-card')?.textContent).toContain(HERO_TEXT.clem.passive.name);
    expect(b.root.querySelector('.cb-still')?.textContent).toContain('Always on');
    click(b.root.querySelector('.cb-skill-btn[data-slot="basic"]'));
    expect(b.root.querySelector('.cb-still')?.textContent).toContain('Melee basic attack');
    // one player for the whole browser
    expect(f.players).toHaveLength(1);
  });

  it('a tap on the playing clip pauses it, another plays it; a skill tap always plays', async () => {
    const f = fakeClips();
    const b = openChampBrowser({ hero: 'clem', clips: f.factory });
    await flush();
    click(b.root.querySelector('.cb-clip'));
    expect(b.root.dataset.clip).toBe('paused');
    expect(f.players[0]?.playing).toBe(false);
    click(b.root.querySelector('.cb-clip'));
    expect(b.root.dataset.clip).toBe('playing');
    click(b.root.querySelector('.cb-clip'));
    click(b.root.querySelector('.cb-skill-btn[data-slot="w"]'));
    await flush();
    expect(b.root.dataset.clip).toBe('playing');
  });

  it('the arrows, the keys and a swipe move through the champions and the clip follows', async () => {
    const f = fakeClips();
    const onBrowse = vi.fn();
    const b = openChampBrowser({ hero: 'clem', clips: f.factory, onBrowse });
    await flush();
    click(b.root.querySelector('.cb-next'));
    await flush();
    expect(b.hero()).toBe(stepHero(BROWSE_ORDER, 'clem', 1));
    expect(onBrowse).toHaveBeenLastCalledWith(b.hero());
    expect(f.log.at(-1)).toBe(`set ${b.hero()}:q`);
    click(b.root.querySelector('.cb-prev'));
    click(b.root.querySelector('.cb-prev'));
    expect(b.hero()).toBe(BROWSE_ORDER.at(-1));
    key('ArrowRight');
    expect(b.hero()).toBe('clem');
    // a skill key, then the browse keeps the slot for a clip skill
    key('e');
    expect(b.slot()).toBe('e');
    key('ArrowRight');
    expect(b.slot()).toBe('e');
    // a swipe left: the next champion
    const before = b.hero();
    const pe = (type: string, x: number): void => {
      const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 100 }) as MouseEvent & { pointerId: number; pointerType: string };
      Object.defineProperty(e, 'pointerId', { value: 1 });
      Object.defineProperty(e, 'pointerType', { value: 'touch' });
      b.root.querySelector('.cb-hero')?.dispatchEvent(e);
    };
    pe('pointerdown', 300);
    pe('pointerup', 300 - SWIPE.px - 4);
    expect(b.hero()).toBe(stepHero(BROWSE_ORDER, before, 1));
    // a short drag is not a swipe
    const now = b.hero();
    pe('pointerdown', 300);
    pe('pointerup', 290);
    expect(b.hero()).toBe(now);
  });

  it('Lore shows the hook, bio, quote, how they fight, home and both links; a link jumps to that champion', async () => {
    const b = openChampBrowser({ hero: 'brutus', clips: null, tab: 'lore' });
    const lore = b.root.querySelector('.cb-lore') as HTMLElement;
    expect(lore.hidden).toBe(false);
    expect((b.root.querySelector('.cb-skills') as HTMLElement).hidden).toBe(true);
    const t = lore.textContent ?? '';
    const l = LORE.brutus;
    // the hook sits once, in the champion column beside both tabs (the Lore tab does not repeat it)
    expect(b.root.querySelector('.cb-hook')?.textContent).toBe(l.hook);
    expect(t).not.toContain(l.hook);
    expect(t).toContain(l.quote);
    expect(t).toContain(l.howTheyFight);
    expect(t).toContain(l.home);
    for (const p of l.bio.split(/\n\s*\n/)) expect(t).toContain(p.trim());
    expect(t).toContain(l.rival.line);
    expect(t).toContain(l.friend.line);
    // the world opens under it
    expect((lore.querySelector('.cb-world') as HTMLElement).hidden).toBe(true);
    click(lore.querySelector('.cb-world-btn'));
    expect((b.root.querySelector('.cb-world') as HTMLElement).hidden).toBe(false);
    click(b.root.querySelector('.cb-link[data-rel="rival"]'));
    expect(b.hero()).toBe(l.rival.hero);
    expect(b.tab()).toBe('lore');
    click(b.root.querySelector('.cb-link[data-rel="friend"]'));
    expect(b.hero()).toBe(LORE[l.rival.hero].friend.hero);
  });

  it('every hero opens with all six cards and its lore, with no clip in the still slots', () => {
    for (const h of HERO_IDS) {
      const b = openChampBrowser({ hero: h, clips: null });
      expect(b.root.querySelectorAll('.cb-skill-btn')).toHaveLength(6);
      expect(b.root.querySelector('.cb-name')?.textContent).toBe(HERO_TEXT[h].title);
      for (const c of heroCodex(h).cards) {
        b.setSlot(c.slot);
        expect(b.root.querySelector('.cb-card b')?.textContent).toBe(c.name);
      }
      b.setTab('lore');
      expect(b.root.querySelector('.cb-lore')?.textContent).toContain(LORE[h].quote);
      b.close();
    }
  });

  it('Tab stays inside the dialog, and the tab list and the skill list take the arrow keys', () => {
    const b = openChampBrowser({ hero: 'clem', clips: null });
    // focus starts on the selected skill
    expect(document.activeElement?.getAttribute('data-slot')).toBe('q');
    key('ArrowRight', document.activeElement as HTMLElement);
    expect(b.slot()).toBe('w');
    expect(b.hero()).toBe('clem');
    const tab = b.root.querySelector<HTMLElement>('.cb-tab[data-tab="skills"]') as HTMLElement;
    tab.focus();
    key('ArrowRight', tab);
    expect(b.tab()).toBe('lore');
    expect(b.hero()).toBe('clem');
  });

  it('Esc, ✕ and a tap on the backdrop close it, dispose the clip and give focus back', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const f = fakeClips();
    const onClose = vi.fn();
    let b = openChampBrowser({ hero: 'clem', clips: f.factory, onClose });
    await flush();
    key('Escape');
    expect(b.open).toBe(false);
    expect(document.querySelector('.pl-champ')).toBeNull();
    expect(f.players[0]?.disposed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    b = openChampBrowser({ hero: 'clem', clips: null });
    click(b.root.querySelector('.cb-x'));
    expect(b.open).toBe(false);
    b = openChampBrowser({ hero: 'clem', clips: null });
    click(b.root);
    expect(b.open).toBe(false);
  });

  it('a clip still loading when the browser closes is disposed when it lands', async () => {
    let resolve: (p: ClipPlayer) => void = () => undefined;
    const p = { ready: Promise.resolve(), play: vi.fn(), stop: vi.fn(), set: vi.fn(() => Promise.resolve()), dispose: vi.fn() };
    const b = openChampBrowser({ hero: 'clem', clips: () => new Promise<ClipPlayer>((r) => (resolve = r)) });
    await flush();
    b.close();
    resolve(p);
    await flush();
    expect(p.dispose).toHaveBeenCalledTimes(1);
    expect(p.play).not.toHaveBeenCalled();
  });

  it('a clip player that fails shows the still with "Preview unavailable"', async () => {
    const b = openChampBrowser({ hero: 'clem', clips: () => Promise.reject(new Error('no webgl')) });
    await flush();
    expect(b.root.dataset.clip).toBe('off');
    expect(b.root.querySelector('.cb-still')?.textContent).toContain('Preview unavailable');
  });

  it('closes itself when the screen that opened it is torn down', async () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const b = openChampBrowser({ hero: 'clem', clips: null, within: host });
      host.remove();
      vi.advanceTimersByTime(500);
      expect(b.open).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Select picks through the opener and closes; a blocked hero shows why and cannot be selected', () => {
    const on = vi.fn();
    const b = openChampBrowser({ hero: 'clem', clips: null, pick: { can: (h) => (HEROES[h].side === 'dog' ? 'Dogs unlock after your first match' : ''), on } });
    b.show('brutus');
    const sel = b.root.querySelector<HTMLButtonElement>('.cb-select') as HTMLButtonElement;
    expect(sel.disabled).toBe(true);
    expect(b.root.querySelector('.cb-why')?.textContent).toBe('Dogs unlock after your first match');
    click(sel);
    expect(on).not.toHaveBeenCalled();
    b.show('sage');
    click(b.root.querySelector('.cb-select'));
    expect(on).toHaveBeenCalledWith('sage');
    expect(b.open).toBe(false);
  });
});

describe('the skill card markup', () => {
  it('the full card has every fact, the tags, the tip and the counter; the compact one at most four facts', () => {
    const c = skillCard('gabe', 'r');
    const full = skillCardHtml(c);
    for (const f of c.facts) expect(full).toContain(f.label);
    expect(full).toContain('cb-tip');
    expect(full).toContain('cb-counter');
    const div = document.createElement('div');
    div.innerHTML = skillCardHtml(c, { compact: true });
    expect(div.querySelectorAll('.cb-facts > div').length).toBeLessThanOrEqual(4);
    expect(div.querySelector('.cb-tip')).toBeNull();
  });
  it('hard crowd control tags are marked so they stand out', () => {
    const div = document.createElement('div');
    div.innerHTML = skillCardHtml(skillCard('brutus', 'e'));
    expect(div.querySelector('.cb-tags li.cc')?.textContent).toBe('Stun');
  });
});

describe('Preview in the champion select panel (the only live clip on the pick)', () => {
  const base = (o: Partial<PickOpts> = {}): PickOpts => ({
    initial: { hero: 'clem', trick: 'pounce', difficulty: 'easy' },
    onHero: vi.fn(),
    onStart: vi.fn(),
    onBack: vi.fn(),
    ...o,
  });

  it('no 3D on the pick itself: Preview opens the browser on the hero and the tapped skill', async () => {
    const o = base();
    const root = pickScreen(document.body, o);
    expect(root.querySelector('canvas')).toBeNull();
    click(root.querySelector('.cs-tile[data-h="sage"]'));
    expect(o.onHero).toHaveBeenCalledWith('sage');
    click(root.querySelector('.cs-sk[data-slot="e"]'));
    click(root.querySelector('[data-a="codex"]'));
    await vi.waitFor(() => expect(openBrowser()?.hero()).toBe('sage'));
    expect(openBrowser()?.slot()).toBe('e');
    openBrowser()?.close();
  });

  it('Select in the browser selects another hero (a dog too), and the grid follows', async () => {
    const o = base();
    const root = pickScreen(document.body, o);
    click(root.querySelector('[data-a="codex"]'));
    await vi.waitFor(() => expect(openBrowser()?.hero()).toBe('clem'));
    const b = openBrowser()!;
    b.show('howler');
    click(b.root.querySelector('.cb-select'));
    expect(o.onHero).toHaveBeenLastCalledWith('howler');
    expect(root.querySelector('.cs-tile.on')?.getAttribute('data-h')).toBe('howler');
    expect(document.documentElement.dataset.pickSide).toBe('dog');
    b.close();
  });

  it('before the first match the dogs cannot be selected from the browser', async () => {
    const o = base({ dogsLocked: true });
    const root = pickScreen(document.body, o);
    click(root.querySelector('[data-a="codex"]'));
    await vi.waitFor(() => expect(openBrowser()).not.toBeNull());
    const b = openBrowser()!;
    b.show('brutus');
    expect(b.root.querySelector<HTMLButtonElement>('.cb-select')?.disabled).toBe(true);
    b.show('sage');
    click(b.root.querySelector('.cb-select'));
    expect(o.onHero).toHaveBeenLastCalledWith('sage');
    b.close();
  });

  it('LOCK IN starts with no browser in between', () => {
    const o = base();
    const root = pickScreen(document.body, o);
    click(root.querySelector('[data-a="start"]'));
    expect(o.onStart).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.pl-champ')).toBeNull();
  });

  it('the party pick: tiles keep their pick action; Preview is the hovered hero on the tapped skill', () => {
    const view = {
      code: 'ABC123',
      you: 'm1',
      leader: 'm1',
      phase: 'pick',
      members: [{ id: 'm1', name: 'Me', hero: 'sage', locked: false, slot: 0 }],
    } as unknown as PartyView;
    const div = document.createElement('div');
    div.innerHTML = pickHtml({ view, hover: 'sage', trick: 'pounce', secondsLeft: 20, error: null });
    expect(div.querySelector<HTMLElement>('[data-h="clem"]')?.dataset.p).toBe('hero');
    const btn = div.querySelector<HTMLElement>('[data-testid="party-info"]');
    expect(btn?.dataset.p).toBe('info');
    expect(btn?.dataset.v).toBe('sage');
    expect(btn?.dataset.slot).toBeTruthy();
  });
});

describe('the in-match skill peek', () => {
  const setup = (): { ui: HTMLElement; off: () => void } => {
    const ui = document.createElement('div');
    ui.innerHTML = `<div class="pl-touch"><button class="pl-tbtn q" data-b="q"></button><button class="pl-tbtn r" data-b="r"></button><button class="pl-tbtn attack" data-b="attack"></button></div><div class="pl-hud"><button class="pl-slot" data-i="1"></button><button class="pl-slot" data-i="4"></button></div>`;
    document.body.appendChild(ui);
    const off = attachSkillPeek(ui, 'clem', () => ({ level: 5, choices: [-1, -1, -1], branch: false }));
    return { ui, off };
  };
  const pointer = (type: string, target: EventTarget, x = 10, y = 10): void => {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }) as MouseEvent & { pointerId: number };
    Object.defineProperty(e, 'pointerId', { value: 7 });
    target.dispatchEvent(e);
  };

  it('maps the touch buttons and the HUD slots to skills, and nothing else', () => {
    const { ui, off } = setup();
    expect(slotOfButton(ui.querySelector('[data-b="q"]'))?.slot).toBe('q');
    expect(slotOfButton(ui.querySelector('[data-i="1"]'))?.slot).toBe('w');
    expect(slotOfButton(ui.querySelector('[data-b="attack"]'))).toBeNull();
    expect(slotOfButton(ui.querySelector('[data-i="4"]'))).toBeNull();
    off();
  });

  it('a hold shows the card at the hero level; the release keeps it a moment; a drag is an aim and shows nothing', () => {
    vi.useFakeTimers();
    try {
      const { ui, off } = setup();
      const card = ui.querySelector('.pl-skill-peek') as HTMLElement;
      const q = ui.querySelector('[data-b="q"]') as HTMLElement;
      pointer('pointerdown', q);
      vi.advanceTimersByTime(PEEK.holdMs - 50);
      expect(card.classList.contains('on')).toBe(false);
      vi.advanceTimersByTime(60);
      expect(card.classList.contains('on')).toBe(true);
      expect(ui.classList.contains('pl-peeking')).toBe(true);
      expect(document.documentElement.dataset.skillPeek).toBe('q');
      const c5 = skillCard('clem', 'q', { level: 5, choices: [-1, -1, -1] });
      expect(card.textContent).toContain(c5.name);
      expect(card.textContent).toContain(`Rank ${c5.rank} of ${c5.maxRank}`);
      // the level-5 damage, not the level-1 growth text
      const dmg = c5.facts.find((f) => f.label === 'Damage');
      if (dmg) expect(card.textContent).toContain(dmg.value);
      pointer('pointerup', window);
      expect(card.classList.contains('on')).toBe(true);
      vi.advanceTimersByTime(PEEK.lingerMs + 10);
      expect(card.classList.contains('on')).toBe(false);
      // a drag past the aim threshold: nothing
      pointer('pointerdown', q, 10, 10);
      pointer('pointermove', window, 10 + PEEK.movePx + 5, 10);
      vi.advanceTimersByTime(PEEK.holdMs * 2);
      expect(card.classList.contains('on')).toBe(false);
      pointer('pointerup', window);
      // a quick tap: nothing
      pointer('pointerdown', q);
      vi.advanceTimersByTime(100);
      pointer('pointerup', window);
      vi.advanceTimersByTime(PEEK.holdMs);
      expect(card.classList.contains('on')).toBe(false);
      off();
      expect(ui.querySelector('.pl-skill-peek')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the listeners are passive: the press still reaches the button and is never cancelled', () => {
    const { ui, off } = setup();
    const q = ui.querySelector('[data-b="q"]') as HTMLElement;
    const got = vi.fn();
    q.addEventListener('pointerdown', got);
    const e = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    q.dispatchEvent(e);
    expect(got).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
    off();
  });

  it('the ultimate before level 4 says when it unlocks; a taken level-6 branch shows the branch', () => {
    expect(peekHtml('clem', 'r', { level: 2, choices: [], branch: false })).toContain('Unlocks at level 4');
    const h = HERO_IDS.find((x) => HERO_TEXT[x].branch);
    if (h) {
      const br = HERO_TEXT[h].branch!;
      const slot = (['q', 'w', 'e', 'r'] as const)[br.slot];
      expect(peekHtml(h, slot, { level: 7, choices: [], branch: true })).toContain(br.name);
    }
  });
});
