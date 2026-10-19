/**
 * Grand Prix standings between races: the eight cats sorted by points, rows sliding from the old order to the new
 * one (0.6 s; instant with reduced motion), a "+N" chip per cat for the race just run, the rival marked. Continue
 * races on (or goes to the podium after race 4); Quit cup goes to the menu with the cup saved.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { h, modal } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { reducedMotion } from '../../ui/a11y';
import { cupDef, standings } from '../gp/cup';
import { flow } from '../flow';
import { focusFirst, frame, hex, plain, primary, heldBack } from './ui';

const ROW_H = 40;

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  const f = flow();
  const run = f.save.cup;
  if (!run) {
    queueMicrotask(() => f.goMenu());
    return {};
  }
  const cup = cupDef(run);
  const done = run.race >= cup.races.length;
  const fr = frame(root, { title: t('Standings'), sub: t('{cup} · after race {n} of {of}', { cup: t(cup.name), n: run.race, of: cup.races.length }), cls: 'fm-m-standings', noBack: true });
  const now = standings(run);
  const before = f.lastOrder.length === now.length ? f.lastOrder : now;
  const gained = f.lastGained.length === now.length ? f.lastGained : now.map(() => 0);
  const table = h('div', { class: 'fm-m-stand', role: 'table', style: `height:${now.length * ROW_H}px` });
  const rows = now.map((fi) => {
    const r = run.field[fi];
    const row = h('div', { class: `fm-m-srow${r.player ? ' me' : ''}`, role: 'row' }, [
      h('span', { class: 'pos', role: 'cell' }, [String(now.indexOf(fi) + 1)]),
      h('i', { class: 'dot', style: `background:${hex(r.kart.paint[0])}`, 'aria-hidden': 'true' }),
      h('span', { class: 'nm', role: 'cell' }, [r.name, fi === run.rival ? h('small', { class: 'rv' }, [` ${t('RIVAL')}`]) : null]),
      gained[fi] ? h('span', { class: 'gain', role: 'cell' }, [`+${gained[fi]}`]) : h('span', { class: 'gain none', role: 'cell' }, ['']),
      h('b', { class: 'pts', role: 'cell' }, [String(run.points[fi])]),
    ]);
    row.style.transform = `translateY(${before.indexOf(fi) * ROW_H}px)`;
    table.append(row);
    return { fi, row };
  });
  fr.body.append(table);
  const me = run.field.findIndex((r) => r.player);
  const myPos = now.indexOf(me) + 1;
  const g = f.lastGp;
  if (g) fr.body.append(h('p', { class: 'fm-line' }, [t('You: {p} in the race, +{n} points, {s} overall', { p: ordinal(g.place), n: g.gained, s: ordinal(myPos) })]));
  // slide the rows into their new places
  const slide = () => {
    for (const { fi, row } of rows) {
      row.classList.add('go');
      row.style.transform = `translateY(${now.indexOf(fi) * ROW_H}px)`;
    }
  };
  if (reducedMotion()) slide();
  else setTimeout(slide, 350);

  const quit = () =>
    void modal(t('Quit the cup?'), t('Your cup is saved. Resume it from the menu at the next race.'), [t('Quit'), t('Keep racing')]).then((i) => {
      if (i === 0) f.shell.quitToMenu();
    });
  fr.footer.append(plain(t('Quit cup'), quit, 'quit'), primary(done ? t('Podium 🏆') : t('Next race ▶'), () => f.runCupRace(), 'continue'));
  focusFirst(root, '[data-act="continue"]');
  return {
    back: () => {
      if (heldBack()) return true;
      quit();
      return true;
    },
  };
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${s}`;
}
