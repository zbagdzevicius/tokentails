/**
 * Main menu: a resume card for a Grand Prix in progress, then the tiles (Grand Prix, Single race, Time Trial, Balloon Battle,
 * Daily Cup, Track Doodle, Garage, Your cat, Pink Paw, Settings, How to play, plus tiles other lanes register).
 * Locked tiles say what unlocks them. Esc / B goes back to the title.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { hasScreen, screens } from '../../core/app/screens';
import { TRACKS } from '../../core/track/tracks';
import { CUPS, cupById } from '../../content/cups';
import { DEFAULT_CAT } from '../../types';
import { dailySetup, dayNoFor } from '../../share/daily/daily';
import { clearYourCat, saveYourCat, yourCat } from '../../share/yourcat/store';
import { h, modal, tile } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { flow } from '../flow';
import { menuTiles, type MenuTile } from '../hooks';
import { classLabel, frame, focusFirst, touchUi, TROPHY, heldBack } from './ui';

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  const f = flow();
  const fr = frame(root, { title: 'Formula Meow', cls: 'fm-m-menu', noBack: true });
  fr.panel.querySelector('h1')!.classList.add('fm-m-mini-logo');
  const s = f.save;

  // resume a cup in progress
  const run = f.cupInProgress();
  if (run) {
    const cup = cupById(run.cupId)!;
    const card = h('div', { class: 'fm-m-resume' }, [
      h('button', { class: 'fm-btn primary fm-m-resume-go', type: 'button', 'data-act': 'resume' }, [
        h('span', {}, [t('▶ Resume {cup}', { cup: t(cup.name) })]),
        h('small', {}, [t('{cls} · race {n} of {of}', { cls: classLabel(run.cls), n: Math.min(run.race + 1, cup.races.length), of: cup.races.length })]),
      ]),
      h('button', { class: 'fm-btn fm-m-resume-drop', type: 'button', 'aria-label': t('Drop this cup'), 'data-act': 'drop' }, ['✕']),
    ]);
    card.querySelector('[data-act="resume"]')!.addEventListener('click', () => f.runCupRace());
    card.querySelector('[data-act="drop"]')!.addEventListener('click', () => {
      void modal(t('Drop this cup?'), t('The points so far are lost. Trophies you already won stay.'), [t('Drop it'), t('Keep it')]).then((i) => {
        if (i !== 0) return;
        f.dropCup();
        void screens.replace('menu');
      });
    });
    fr.body.append(card);
  }

  const golds = Object.values(s.trophies).filter((x) => x === 1).length;
  const trophies = Object.values(s.trophies).length;
  const ttGolds = Object.values(s.tt).filter((r) => r.medal === 3).length;
  const day = dayNoFor(new Date());
  const daily = dailySetup(day, TRACKS);
  const builtIn: MenuTile[] = [
    { id: 'gp', order: 10, icon: '🏆', label: () => t('Grand Prix'), sub: () => (trophies === 1 ? t('1 trophy · {g} gold', { g: golds }) : trophies ? t('{n} trophies · {g} gold', { n: trophies, g: golds }) : t('{n} cups of 4 races', { n: CUPS.length })), run: () => void screens.push('select', { next: 'gp' }) },
    { id: 'race', order: 15, icon: '🏁', label: () => t('Single race'), sub: () => t('Any track, any class'), run: () => void screens.push('select', { next: 'race' }) },
    { id: 'tt', order: 20, icon: '⏱️', label: () => t('Time Trial'), sub: () => (ttGolds ? t('{n} gold medals', { n: ttGolds }) : t('Beat the ghosts')), run: () => void screens.push('select', { next: 'tt' }) },
    { id: 'battle', order: 30, icon: '🎈', label: () => t('Balloon Battle'), sub: () => (s.battle.played ? t('{w} wins of {n}', { w: s.battle.wins, n: s.battle.played }) : t('Pop or be popped')), lock: () => f.lock('mode', 'battle'), run: () => void screens.push('select', { next: 'battle' }) },
    { id: 'daily', order: 40, icon: '📅', label: () => t('Daily Cup #{n}', { n: day }), sub: () => daily.label, run: () => f.startDaily() },
    { id: 'doodle', order: 50, icon: '✍️', label: () => t('Track Doodle'), sub: () => t('Draw, race, share'), run: () => void screens.push('tracks') },
    { id: 'garage', order: 60, icon: '🏎️', label: () => t('Garage'), sub: () => t('Kart, paint, cat'), run: () => void (hasScreen('garage') ? screens.push('garage') : screens.push('select', { next: 'garage' })) },
    {
      id: 'yourcat',
      order: 70,
      icon: '🐱',
      label: () => t('Your cat'),
      sub: () => yourCat()?.name ?? t('Race as your own cat'),
      run: () =>
        void import('../../share/yourcat/maker').then((m) =>
          m.openMaker(f.shell.host, yourCat(), DEFAULT_CAT).then((r) => {
            if (r === undefined) return;
            if (r === null) {
              clearYourCat();
              f.setLook((x) => (x.cat = 'tofu'));
            } else {
              saveYourCat(r.cat, r.name, r.face);
              f.setLook((x) => (x.cat = 'own'));
            }
            void screens.replace('menu');
          }),
        ),
    },
    { id: 'pinkpaw', order: 80, icon: '🐾', label: () => t('Pink Paw'), sub: () => t('Meet the real cats'), run: () => void screens.push('pinkpaw') },
    { id: 'settings', order: 90, icon: '⚙️', label: () => t('Settings'), run: () => void screens.push('settings') },
    { id: 'howto', order: 100, icon: '❓', label: () => t('How to play'), run: () => void screens.push('howto') },
  ];
  // other lanes' screens that exist get a tile too (unless a lane registered its own)
  const extra: MenuTile[] = [];
  if (hasScreen('achievements')) extra.push({ id: 'achievements', order: 65, icon: '🏅', label: () => t('Achievements'), run: () => void screens.push('achievements') });
  if (hasScreen('stats')) extra.push({ id: 'stats', order: 66, icon: '📊', label: () => t('Stats'), run: () => void screens.push('stats') });
  const all = new Map<string, MenuTile>();
  for (const x of [...builtIn, ...extra, ...menuTiles()]) all.set(x.id, x);
  // three tiers (B: 13 equal tiles had no hierarchy): the Grand Prix hero card, the four other ways to race, then a
  // compact strip for the garage, doodles, your cat, Pink Paw, settings and help
  const MODES = new Set(['race', 'tt', 'battle', 'daily']);
  const hero = h('div', { class: 'fm-ui-grid fm-m-tiles fm-m-hero' });
  const modes = h('div', { class: 'fm-ui-grid fm-m-tiles fm-m-modes' });
  const strip = h('div', { class: 'fm-ui-grid fm-m-tiles fm-m-strip' });
  for (const x of [...all.values()].sort((a, b) => a.order - b.order)) {
    const lock = x.lock?.() ?? null;
    const into = x.id === 'gp' ? hero : MODES.has(x.id) ? modes : strip;
    const el = tile(
      x.label(),
      () => {
        f.update((v) => (v.last.focus = x.id));
        x.run();
      },
      { icon: x.icon, sub: into === strip ? undefined : x.sub?.(), locked: !!lock, lockText: lock ?? undefined },
    );
    el.dataset.tile = x.id;
    into.append(el);
  }
  for (const g of [hero, modes, strip]) if (g.childElementCount) fr.body.append(g);
  // trophies shelf: the best trophy per cup and class
  const shelf = CUPS.map((c) => {
    const row = [0, 1, 2, 3].map((cls) => TROPHY[s.trophies[`${c.id}:${cls}`] ?? 0] || '·').join(' ');
    return h('span', {}, [`${t(c.name)} ${row}`]);
  });
  if (trophies) fr.body.append(h('p', { class: 'fm-m-shelf' }, shelf));
  fr.footer.remove();
  const last = root.querySelector<HTMLElement>(`[data-tile="${s.last.focus}"]`);
  if (last) focusFirst(root, `[data-tile="${s.last.focus}"]`);
  else focusFirst(root);
  // back from a screen opened here: the focus returns to its tile (keyboard and pad players keep their place)
  const off = screens.onChange((topNow) => {
    if (topNow !== 'menu' || touchUi()) return;
    requestAnimationFrame(() => {
      if (root.contains(document.activeElement)) return;
      root.querySelector<HTMLElement>(`[data-tile="${flow().save.last.focus}"]`)?.focus({ preventScroll: true });
    });
  });
  return {
    back: () => {
      if (heldBack()) return true;
      void screens.replace('title');
      return true;
    },
    unmount: off,
  };
}
