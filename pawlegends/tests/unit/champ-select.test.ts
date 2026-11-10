// @vitest-environment happy-dom
/**
 * Champion select, adapted from Wild Rift (docs/plans/moba/LANDING-PICK-UX.md Part B): one tap selects and shows the
 * skills, LOCK IN commits (a double tap within 300 ms too), the side and role filters combine, the tapped skill stays
 * across heroes, the cooldown shows only with the numbers pref, the team column fills 3 or 5 seats (usernames on
 * humans, champion names on bots), LOCK IN says why when it cannot, and a redraw keeps the grid. No 3D on the screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickScreen, type PickOpts } from '../../src/ui/screens';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import type { HeroRole } from '../../src/data/heroes/types';
import { HERO_TEXT } from '../../src/ui/heroText';
import {
  champCodexReady,
  champSelectHtml,
  champSelectState,
  DOUBLE_TAP_MS,
  passesFilter,
  patchChampSelect,
  resetChampSelect,
  skillInfo,
  timerText,
  wireChampSelect,
  type CsModel,
} from '../../src/ui/champSelect/champSelect';
import { ROLE_ICON, ROLE_NAME, ROLE_ORDER } from '../../src/ui/champSelect/roles';
import { partySeats, soloSeats } from '../../src/ui/champSelect/seats';
import { pickHtml, pickModel } from '../../src/party/ui/partyPick';
import type { PartyView } from '../../src/net/proto';

const base = (o: Partial<PickOpts> = {}): PickOpts => ({
  initial: { hero: 'clem', trick: 'pounce', difficulty: 'easy' },
  onHero: vi.fn(),
  onStart: vi.fn(),
  onBack: vi.fn(),
  ...o,
});
const mount = (o: Partial<PickOpts> = {}): HTMLElement => pickScreen(document.body, base(o));
const visible = (root: HTMLElement): string[] => [...root.querySelectorAll<HTMLElement>('.cs-grid [data-h]:not([hidden])')].map((e) => e.dataset.h ?? '');
const click = (el: Element | null | undefined): void => {
  (el as HTMLElement | null)?.click();
};

beforeEach(() => resetChampSelect());
afterEach(() => {
  document.body.innerHTML = '';
  delete document.documentElement.dataset.pickSide;
});

describe('the regions', () => {
  it('header, team column, tabs, grid, hero panel, LOCK IN and the trick row are all there; no canvas, no scroll column', () => {
    const root = mount();
    for (const sel of ['.cs-head', '.cs-team', '.cs-tabs', '.cs-grid', '.cs-panel', '.cs-lock', '.cs-tricks', '.cs-bots']) expect(root.querySelector(sel), sel).not.toBeNull();
    expect(root.querySelector('canvas')).toBeNull();
    expect(root.querySelector('.pl-pick-col')).toBeNull();
    expect(root.querySelector('.cs-lock')?.textContent).toContain('LOCK IN');
    expect(root.querySelector('.cs-lock small')?.textContent).toBe('vs Easy bots');
    // the role tabs: six, in order, each with its glyph and name
    expect([...root.querySelectorAll<HTMLElement>('[data-cs="role"]')].map((b) => b.dataset.role)).toEqual([...ROLE_ORDER]);
    for (const r of ROLE_ORDER) expect(ROLE_ICON[r]).toBeTruthy();
    expect(ROLE_NAME.marksman).toBe('Marksman');
  });
});

describe('one tap selects, LOCK IN commits', () => {
  it('a tap selects the hero and shows its skills at once (P Q W E R)', () => {
    const o = base();
    const root = pickScreen(document.body, o);
    click(root.querySelector('[data-h="sage"]'));
    expect(o.onHero).toHaveBeenCalledWith('sage');
    expect(root.querySelector('.cs-tile.on')?.getAttribute('data-h')).toBe('sage');
    const panel = root.querySelector('.cs-panel') as HTMLElement;
    expect(panel.dataset.hero).toBe('sage');
    expect(panel.querySelector('.cs-name')?.textContent).toBe('Sage');
    expect([...panel.querySelectorAll<HTMLElement>('[data-cs="slot"]')].map((b) => b.dataset.slot)).toEqual(['passive', 'q', 'w', 'e', 'r']);
    expect(panel.querySelector('[data-slot="passive"]')?.getAttribute('aria-label')).toBe(`Passive: ${HERO_TEXT.sage.passive.name}`);
    expect(panel.querySelector('[data-slot="r"]')?.getAttribute('aria-label')).toBe(`R: ${HERO_TEXT.sage.abilities[3].name}`);
    expect(panel.querySelector('.cs-sk-name')?.textContent).toBe(HERO_TEXT.sage.passive.name);
    expect(o.onStart).not.toHaveBeenCalled();
    click(root.querySelector('[data-a="start"]'));
    expect(o.onStart).toHaveBeenCalledWith({ hero: 'sage', trick: 'pounce', difficulty: 'easy' });
  });

  it('a double tap on a portrait (within 300 ms) locks in; two slow taps do not', async () => {
    const o = base();
    const root = pickScreen(document.body, o);
    let now = 1000;
    wireChampSelect(root, { onBack: o.onBack }, () => now);
    click(root.querySelector('[data-h="lambo"]'));
    now += DOUBLE_TAP_MS + 50;
    click(root.querySelector('[data-h="lambo"]'));
    await Promise.resolve();
    expect(o.onStart).not.toHaveBeenCalled();
    now += 120;
    click(root.querySelector('[data-h="lambo"]'));
    await Promise.resolve();
    expect(o.onStart).toHaveBeenCalledWith(expect.objectContaining({ hero: 'lambo' }));
  });

  it('Ctrl/Cmd+Enter locks in, Enter again on the selected tile too; Esc goes back', () => {
    const o = base();
    const root = pickScreen(document.body, o);
    root.querySelector<HTMLElement>('[data-h="clem"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    expect(o.onStart).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLElement>('[data-h="clem"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(o.onBack).toHaveBeenCalledTimes(1);
    // Enter on the tile already selected locks in; Enter on another tile only selects it (its click)
    root.querySelector<HTMLElement>('[data-h="clem"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(o.onStart).toHaveBeenCalledTimes(2);
    root.querySelector<HTMLElement>('[data-h="sage"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(o.onStart).toHaveBeenCalledTimes(2);
  });

  it('the trick row is a radio of four; the bots radio sets the LOCK IN line', () => {
    const o = base();
    const root = pickScreen(document.body, o);
    expect(root.querySelectorAll('.cs-trick[role="radio"]')).toHaveLength(4);
    click(root.querySelector('[data-t="snack"]'));
    expect(root.querySelector('.cs-trick.on')?.getAttribute('data-t')).toBe('snack');
    expect(root.querySelector('.cs-trick-name')?.textContent).toContain('Snack Break');
    click(root.querySelector('[data-d="hard"]'));
    expect(root.querySelector('.cs-lock small')?.textContent).toBe('vs Hard bots');
    click(root.querySelector('[data-a="start"]'));
    expect(o.onStart).toHaveBeenCalledWith({ hero: 'clem', trick: 'snack', difficulty: 'hard' });
  });
});

describe('the skill panel', () => {
  it('a skill tab shows its name and text; the tapped slot stays across heroes', () => {
    const o = base();
    const root = pickScreen(document.body, o);
    click(root.querySelector('[data-cs="slot"][data-slot="r"]'));
    expect(champSelectState().slot).toBe('r');
    expect(root.querySelector('[data-slot="r"]')?.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('.cs-sk-name')?.textContent).toBe(HERO_TEXT.clem.abilities[3].name);
    expect(root.querySelector('.cs-meta span')?.textContent).toBe('R · Ultimate');
    click(root.querySelector('[data-h="sage"]'));
    expect(root.querySelector('.cs-sk-name')?.textContent).toBe(HERO_TEXT.sage.abilities[3].name);
    click(root.querySelector('[data-cs="slot"][data-slot="w"]'));
    expect(root.querySelector('.cs-sk-name')?.textContent).toBe(HERO_TEXT.sage.abilities[1].name);
  });

  it('the cooldown and the facts show only with the numbers pref on', async () => {
    await champCodexReady();
    expect(skillInfo('sage', 'r').cooldown).toMatch(/s/);
    const off = mount();
    click(off.querySelector('[data-cs="slot"][data-slot="q"]'));
    expect(off.querySelector('.cs-meta span')?.textContent).toBe('Q · Skill 1');
    expect(off.querySelector('.cs-facts')).toBeNull();
    document.body.innerHTML = '';
    const onNumbers = vi.fn();
    const on = mount({ numbers: true, onNumbers });
    expect(on.querySelector('.cs-meta span')?.textContent).toMatch(/^Q · Skill 1 · Cooldown \d/);
    expect(on.querySelector('.cs-facts li')).not.toBeNull();
    // the 123 toggle turns them off in place
    click(on.querySelector('[data-cs="numbers"]'));
    expect(onNumbers).toHaveBeenCalledWith(false);
    expect(on.querySelector('.cs-meta span')?.textContent).toBe('Q · Skill 1');
  });
});

describe('the filters', () => {
  it('side and role combine; a role tap again clears it', () => {
    expect(passesFilter('sage', 'cat', 'marksman')).toBe(true);
    expect(passesFilter('sage', 'dog', 'marksman')).toBe(false);
    expect(passesFilter('sage', 'all', 'tank')).toBe(false);
    const root = mount();
    click(root.querySelector('[data-cs="role"][data-role="marksman"]'));
    expect(visible(root)).toEqual(HERO_IDS.filter((h) => HEROES[h].side === 'cat' && HEROES[h].role === 'marksman'));
    click(root.querySelector('[data-cs="side"][data-side="all"]'));
    expect(visible(root)).toEqual(HERO_IDS.filter((h) => HEROES[h].role === 'marksman').sort((a, b) => (HEROES[a].side === HEROES[b].side ? 0 : HEROES[a].side === 'cat' ? -1 : 1)));
    expect(root.querySelector('[data-cs="role"][data-role="marksman"]')?.getAttribute('aria-pressed')).toBe('true');
    click(root.querySelector('[data-cs="role"][data-role="marksman"]'));
    expect(visible(root)).toHaveLength(20);
  });

  it('the rosters are equal: the same role mix on each side (every role tab shows as many cats as dogs)', () => {
    for (const r of ROLE_ORDER as HeroRole[]) {
      const c = HERO_IDS.filter((h) => HEROES[h].side === 'cat' && HEROES[h].role === r).length;
      const d = HERO_IDS.filter((h) => HEROES[h].side === 'dog' && HEROES[h].role === r).length;
      expect(c, r).toBe(d);
      expect(c, r).toBeGreaterThan(0);
    }
  });
});

describe('the team column', () => {
  it('solo: you (username, else "You") then the bots; 3 or 5 seats', () => {
    const three = soloSeats({ name: 'Mia', hero: 'sage', trick: 'pounce', difficulty: 'normal' });
    expect(three.map((s) => s.name)).toEqual(['Mia', 'Bot', 'Bot']);
    expect(three[0]).toMatchObject({ you: true, hero: 'sage', state: 'pick' });
    expect(three[1].sub).toBe('Normal bot');
    const five = soloSeats({ name: null, hero: 'sage', trick: 'pounce', difficulty: 'easy', teamSize: 5, bots: ['lambo', null, null, null] });
    expect(five).toHaveLength(5);
    expect(five[0].name).toBe('You');
    const root = mount({ playerName: 'Mia' });
    const seats = root.querySelectorAll('.cs-seat');
    expect(seats).toHaveLength(3);
    expect(seats[0].classList.contains('me')).toBe(true);
    expect(seats[0].querySelector('b')?.textContent).toBe('Clem');
    expect(seats[0].querySelector('small')?.textContent).toBe('Mia');
    // a bot whose hero is known keeps the champion name
    const html = champSelectHtml({ ...(baseModel() as CsModel), seats: five });
    const d = document.createElement('div');
    d.innerHTML = html;
    expect(d.querySelectorAll('.cs-seat')).toHaveLength(5);
    expect(d.querySelector('[data-state="bot"][data-hero="lambo"] b')?.textContent).toBe('Lambo');
    expect(d.querySelector('.cs')?.getAttribute('data-seats')).toBe('5');
  });

  it('party: humans by slot with usernames, "Selecting…" while hovering, the hero once locked; hidden names stay hidden', () => {
    const v = partyView();
    const seats = partySeats(v, 'nugget', (m) => (m.id === v.you ? m.name : `Teammate ${v.members.indexOf(m) + 1}`));
    expect(seats.map((s) => [s.name, s.state, s.hero])).toEqual([
      ['Teammate 1', 'locked', 'brutus'],
      ['Tom', 'hover', 'nugget'],
      ['Bot', 'bot', null],
    ]);
    // casual PvP: the own team's three slots only
    const pvp = partySeats({ ...v, mm: { side: 'dog', strangers: true, mode: 'casual', team: 1 }, members: [...v.members.map((m) => ({ ...m, slot: (m.slot ?? 0) + 3 })), { id: 'x', name: 'Rival', guest: true, conn: 'on', slot: 0 }] }, '', (m) => m.name);
    expect(pvp.map((s) => s.name)).toEqual(['Mia', 'Tom', 'Bot']);
  });
});

describe('LOCK IN says why', () => {
  it('party: a hero a teammate locked is "Taken by Mia"; the other side is the leader note; nothing hovered says so', () => {
    const v = partyView();
    const taken = pickModel({ view: v, hover: 'brutus', trick: 'pounce', secondsLeft: 9, error: null });
    expect(taken.lock).toMatchObject({ enabled: false, sub: 'Taken by Mia' });
    const ok = pickModel({ view: v, hover: 'nugget', trick: 'pounce', secondsLeft: 9, error: null });
    expect(ok.lock.enabled).toBe(true);
    const none = pickModel({ view: v, hover: '', trick: 'pounce', secondsLeft: 9, error: null });
    expect(none.lock.enabled).toBe(false);
    const friends = pickModel({ view: { ...v, mm: undefined, leader: 'a', members: [{ ...v.members[0], locked: false, hero: 'brutus' }, v.members[1]] }, hover: 'clem', trick: 'pounce', secondsLeft: 9, error: null });
    expect(friends.lock.sub).toBe('Leader chose dogs');
    // the timer: 0:09, red under 10 s
    const d = document.createElement('div');
    d.innerHTML = pickHtml({ view: v, hover: 'nugget', trick: 'pounce', secondsLeft: 9, error: null });
    expect(d.querySelector('[data-testid="party-timer"]')?.textContent).toBe('0:09');
    expect(d.querySelector<HTMLElement>('[data-testid="party-timer"]')?.dataset.low).toBe('1');
    expect(timerText(30)).toBe('0:30');
  });

  it('party: a double tap sends the hover, then presses LOCK IN', async () => {
    const v = partyView();
    const card = document.createElement('div');
    document.body.appendChild(card);
    let hover = 'nugget';
    const draw = (): void => {
      const html = pickHtml({ view: v, hover, trick: 'pounce', secondsLeft: 20, error: null });
      if (!patchChampSelect(card, html)) card.innerHTML = html;
    };
    draw();
    let now = 0;
    wireChampSelect(card, {}, () => now);
    const sent: string[] = [];
    // the party client's own dispatcher (data-p), on the parent as in partyClient
    document.body.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
      if (!t || (t as HTMLButtonElement).disabled) return;
      sent.push(`${t.dataset.p}:${t.dataset.v ?? hover}`);
      if (t.dataset.p === 'hero') {
        hover = t.dataset.v!;
        draw();
      }
    });
    click(card.querySelector('[data-h="howler"]'));
    now += 100;
    click(card.querySelector('[data-h="howler"]'));
    await Promise.resolve();
    expect(sent).toEqual(['hero:howler', 'hero:howler', 'lock:howler']);
  });

  it('a redraw keeps the grid element (its scroll), the tapped skill and the filter', () => {
    const v = partyView();
    const card = document.createElement('div');
    document.body.appendChild(card);
    card.innerHTML = pickHtml({ view: v, hover: 'nugget', trick: 'pounce', secondsLeft: 20, error: null });
    wireChampSelect(card);
    const grid = card.querySelector('.cs-grid');
    click(card.querySelector('[data-cs="slot"][data-slot="e"]'));
    click(card.querySelector('[data-cs="role"][data-role="tank"]'));
    expect(patchChampSelect(card, pickHtml({ view: v, hover: 'marshmallow', trick: 'pounce', secondsLeft: 19, error: null }))).toBe(true);
    expect(card.querySelector('.cs-grid')).toBe(grid);
    expect(card.querySelector('.cs-panel')?.getAttribute('data-hero')).toBe('marshmallow');
    expect(card.querySelector('[data-slot="e"]')?.getAttribute('aria-selected')).toBe('true');
    expect(visible(card)).toEqual(HERO_IDS.filter((h) => HEROES[h].side === 'dog' && HEROES[h].role === 'tank'));
  });

  it("a redraw shows the new hero's own skill icons (the skill tabs and Preview carry data-slot, but are not host slots)", () => {
    const v = partyView();
    const card = document.createElement('div');
    document.body.appendChild(card);
    const html = (hover: string): string => pickHtml({ view: v, hover, trick: 'pounce', secondsLeft: 20, error: null });
    card.innerHTML = html('nugget');
    // the integration's squad slot: what the host drew in it survives every redraw
    const squad = document.createElement('div');
    squad.className = 'cs-squad';
    squad.dataset.slot = 'cards';
    squad.innerHTML = '<b class="host">squad</b>';
    card.querySelector('.cs-team')!.appendChild(squad);
    for (const h of ['nugget', 'marshmallow', 'howler']) {
      expect(patchChampSelect(card, html(h))).toBe(true);
      const fresh = document.createElement('div');
      fresh.innerHTML = html(h);
      expect(card.querySelector('.cs-skills')!.innerHTML).toBe(fresh.querySelector('.cs-skills')!.innerHTML);
      expect(card.querySelector('.cs-sk[data-slot="passive"]')!.textContent).not.toContain('Preview');
      expect(card.querySelector('.cs-preview')!.textContent).toContain('Preview');
    }
  });

  it('arrow keys skip a tile that cannot take focus (focus never sticks on a disabled tile)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const heroes = HERO_IDS.filter((h) => HEROES[h].side === 'cat').slice(0, 4);
    const m = { ...baseModel(), heroes, selected: heroes[0], tile: (h: string) => ({ disabled: h === heroes[1] }) } as CsModel;
    root.innerHTML = champSelectHtml(m);
    wireChampSelect(root);
    const first = root.querySelector<HTMLElement>(`[data-h="${heroes[0]}"]`)!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement?.getAttribute('data-h')).toBe(heroes[2]);
    expect(root.querySelector<HTMLElement>(`[data-h="${heroes[1]}"]`)!.tabIndex).toBe(-1);
  });
});

function baseModel(): Partial<CsModel> {
  return { kind: 'solo', seats: [], heroes: HERO_IDS, selected: 'clem', sideTabs: true, trick: 'pounce', lock: { enabled: true, label: 'LOCK IN' }, numbers: false };
}

function partyView(): PartyView {
  return {
    t: 'party',
    code: '',
    phase: 'pick',
    leader: 'a',
    difficulty: 'normal',
    openSeats: false,
    locked: true,
    you: 'b',
    deadlineMs: 30_000,
    members: [
      { id: 'a', name: 'Mia', guest: true, conn: 'on', slot: 0, hero: 'brutus', locked: true },
      { id: 'b', name: 'Tom', guest: true, conn: 'on', slot: 1, hero: 'nugget' },
    ],
    mm: { side: 'dog', strangers: true },
  };
}
