// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { goalsPanelHtml, goalsWidth, questCard, topBelowPlate } from '../../src/ui/home/goalsPanel';
import { leftText, liveopsCardsHtml } from '../../src/ui/events/eventsPanel';
import { FRIEND_QUEST, QUEST_POOL, QUEST_XP, type QuestView } from '../../src/meta/quests';
import { parseConfig, type LiveopsState } from '../../src/meta/liveops';

/*
 * Nov 19 Quests facelift (the "sticker board"): the pure state mapping behind each quest card, the panel's markup
 * (stamps, chips, tabs, no fine print), its size and place, and the events' short copy.
 */
const byId = (id: string) => [...QUEST_POOL, FRIEND_QUEST].find((q) => q.id === id)!;
const view = (id: string, value: number, done = false): QuestView => ({ quest: byId(id), value, done, fresh: false });
const frag = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

describe('quest cards', () => {
  it('progress: clamps the count, rounds the bar, keeps the Treat XP', () => {
    const c = questCard(view('takedowns5', 2));
    expect(c).toMatchObject({ label: '5 knockouts or assists', icon: 'takedowns', value: 2, goal: 5, pct: 40, done: false, bonus: false, xp: QUEST_XP });
    expect(c.aria).toBe(`5 knockouts or assists: 2 of 5. ${QUEST_XP} Season XP, added when the match ends`);
    expect(questCard(view('takedowns5', 99)).value).toBe(5);
    expect(questCard(view('takedowns5', -3)).pct).toBe(0);
  });

  it('done: full bar, count at the goal, "done" in the label (a value past the goal counts too)', () => {
    expect(questCard(view('combo3', 1, true))).toMatchObject({ done: true, pct: 100, value: 3 });
    expect(questCard(view('combo3', 3)).done).toBe(true);
    expect(questCard(view('combo3', 3)).aria).toContain(': done.');
  });

  it('pictures: a hero face, the four shelter cats, a themed icon; shorter names', () => {
    expect(questCard(view('win_clem', 0))).toMatchObject({ icon: 'hero', heroes: ['clem'], label: 'Win with Clem' });
    const shelter = questCard(view('champion', 0));
    expect(shelter.icon).toBe('shelter');
    expect(shelter.heroes).toHaveLength(4);
    // the four cats by name: a new player can't tell them apart by their faces
    expect(shelter.label).toBe('Play Lambo, Raspberry, Bengal or Gabby');
    expect(shelter.aria).toMatch(/^Play Lambo, Raspberry, Bengal or Gabby: 0 of 1/);
    expect(questCard(view('towers2', 0))).toMatchObject({ icon: 'towers', label: 'Knock down 2 towers' });
    expect(questCard(view('party2', 1))).toMatchObject({ icon: 'party', bonus: true, label: '2 matches with a friend' });
  });
});

describe('the panel markup', () => {
  const quests = [view('win_clem', 1, true), view('combo3', 1), view('towers2', 0), view('party2', 0)];

  it('stamps done quests, chips the reward in XP, drops the fine print', () => {
    const p = frag(goalsPanelHtml({ quests }));
    const rows = p.querySelectorAll('.hm-qlist .q');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.querySelector('.qstamp')?.textContent).toBe('Nailed it');
    // the stamp takes the XP chip's place: no second tick
    expect(rows[0]!.querySelector('.qx')).toBeNull();
    expect(rows[1]!.querySelector('.qstamp')).toBeNull();
    expect(rows[0]!.querySelector('.n')?.textContent).toBe('1/1');
    expect(rows[1]!.querySelector('.n')?.textContent).toBe('1/3');
    expect(rows[1]!.querySelector('.qx')?.textContent).toBe(`+${QUEST_XP} XP`);
    expect(rows[1]!.querySelector('.qx')?.getAttribute('title')).toBe(`${QUEST_XP} Season XP, added when the match ends`);
    expect(rows[1]!.querySelector<HTMLElement>('.qbar i')!.style.width).toBe('33%');
    expect(rows[0]!.querySelector('img.qf')).toBeTruthy();
    expect(rows[3]!.querySelector('.qtag')?.textContent).toBe('Bonus');
    expect(rows[3]!.querySelector('.qi.k-party svg')).toBeTruthy();
    expect(p.textContent).not.toContain('Treat XP is added');
    expect(p.querySelector('.hm-gp-chip')?.textContent).toBe('1/3');
    expect(p.querySelector('.hm-gp-clock')?.textContent).toMatch(/^New in \d+[hm]$/);
    expect(p.querySelector('.hm-gp-hclock')?.textContent).toMatch(/^\d+[hm]$/);
  });

  it('all done: the chip counts 3/3 with a tick; the bonus friend quest is outside the tally and tagged Bonus', () => {
    const all = [view('win_clem', 1, true), view('combo3', 3, true), view('towers2', 2, true), view('party2', 0)];
    const p = frag(goalsPanelHtml({ quests: all }));
    expect(p.querySelector('.hm-gp-chip.all')?.textContent).toBe('3/3 ✓');
    expect(p.querySelector('.q.bonus .qtag')?.textContent).toBe('Bonus');
    expect(p.querySelectorAll('.qstamp')).toHaveLength(3);
  });

  it('tabs: Today selected by default, Events on request', () => {
    const p = frag(goalsPanelHtml({ quests }));
    expect(p.dataset.tab).toBe('today');
    expect(p.querySelector('[data-gtab="today"]')?.getAttribute('aria-selected')).toBe('true');
    const e = frag(goalsPanelHtml({ quests }, 'events'));
    expect(e.dataset.tab).toBe('events');
    expect(e.querySelector('[data-gtab="events"]')?.getAttribute('aria-selected')).toBe('true');
    expect(e.querySelector('[data-gtab="today"]')?.getAttribute('tabindex')).toBe('-1');
  });

  it('no events: an empty card list (the Events section and the tabs hide)', () => {
    const none: LiveopsState = { config: parseConfig({ v: 1, events: [], featuredQuests: [] }, Date.now())!, me: null, busy: null, toast: null };
    expect(frag(liveopsCardsHtml(none)).children).toHaveLength(0);
  });
});

describe('size and place', () => {
  it('two columns with events from 600 px on a desktop height, capped at 780 (820 on a wide screen); else 520, Today alone 460', () => {
    expect(goalsWidth(1000, 1440, true)).toEqual({ w: 780, wide: true });
    expect(goalsWidth(1400, 1920, true)).toEqual({ w: 820, wide: true });
    expect(goalsWidth(475, 844, true, 390)).toEqual({ w: 475, wide: false });
    // a landscape phone keeps one column (the tabs) even with 600 px free
    expect(goalsWidth(611, 844, true, 390)).toEqual({ w: 520, wide: false });
    expect(goalsWidth(1000, 1440, false)).toEqual({ w: 460, wide: false });
    expect(goalsWidth(100, 400, true).w).toBe(240);
  });

  it('moves below the nameplate when it sits under the panel and the panel keeps 300 px', () => {
    const plate = { left: 650, right: 800, top: 85, bottom: 140 };
    expect(topBelowPlate(110, 800, 117, 897, plate)).toBe(148);
    // a short phone keeps its height
    expect(topBelowPlate(70, 330, 80, 560, { left: 370, right: 490, top: 55, bottom: 100 })).toBe(70);
    // not under the panel
    expect(topBelowPlate(110, 800, 117, 500, plate)).toBe(110);
    expect(topBelowPlate(110, 800, 117, 897, null)).toBe(110);
  });
});

describe('event copy', () => {
  it('time left: days from one day up, hours and minutes under a day', () => {
    expect(leftText(25 * 86_400_000 + 10 * 3_600_000)).toBe('25d left');
    expect(leftText(86_400_000)).toBe('1d left');
    expect(leftText(9 * 3_600_000 + 12 * 60_000)).toBe('9h 12m left');
  });
});
