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
  // after race 1 there is no earlier standing to move from (everyone had 0 points; the old order was the racer list),
  // so no ▲/▼ arrows and no slide: the rows open in their real places (playtest: "You ▼3" after a 4th from 6th)
  const before = run.race > 1 && f.lastOrder.length === now.length ? f.lastOrder : now;
  const gained = f.lastGained.length === now.length ? f.lastGained : now.map(() => 0);
  const table = h('div', { class: 'fm-m-stand', role: 'table', style: `height:${now.length * ROW_H}px` });
  const rows = now.map((fi) => {
    const r = run.field[fi];
    const moved = before.indexOf(fi) - now.indexOf(fi);
    const pts = h('b', { class: 'pts', role: 'cell' }, [String(run.points[fi] - (gained[fi] ?? 0))]);
    const row = h('div', { class: `fm-m-srow${r.player ? ' me' : ''}${fi === run.rival ? ' rival' : ''}`, role: 'row' }, [
      // B8 (polish): the row shows its old place until it slides into the new one
      h('span', { class: 'pos', role: 'cell' }, [String(before.indexOf(fi) + 1)]),
      h('i', { class: 'dot', style: `background:${hex(r.kart.paint[0])}`, 'aria-hidden': 'true' }),
      h('span', { class: 'nm', role: 'cell' }, [r.name, fi === run.rival ? h('small', { class: 'rv' }, [` ${t('RIVAL')}`]) : null]),
      h('span', { class: `mv${moved > 0 ? ' up' : moved < 0 ? ' down' : ''}`, role: 'cell', 'aria-label': moved ? t(moved > 0 ? 'up {n}' : 'down {n}', { n: Math.abs(moved) }) : '' }, [moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : '']),
      gained[fi] ? h('span', { class: 'gain', role: 'cell' }, [`+${gained[fi]}`]) : h('span', { class: 'gain none', role: 'cell' }, ['']),
      pts,
    ]);
    row.style.transform = `translateY(${before.indexOf(fi) * ROW_H}px)`;
    table.append(row);
    return { fi, row, pts };
  });
  fr.body.append(table);
  const me = run.field.findIndex((r) => r.player);
  const myPos = now.indexOf(me) + 1;
  const g = f.lastGp;
  if (g) fr.body.append(h('p', { class: 'fm-line' }, [t('You: {p} in the race, +{n} points, {s} overall', { p: ordinal(g.place), n: g.gained, s: ordinal(myPos) })]));
  // F13 comeback: what the last race did to the field's pace (only while a race is still to come)
  if (!done && run.easeNews === 'eased') fr.body.append(h('p', { class: 'fm-m-ease', 'data-ease': 'eased', role: 'status' }, [t('😼 The cats eased off: catch them!')]));
  else if (!done && run.easeNews === 'restored') fr.body.append(h('p', { class: 'fm-m-ease restored', 'data-ease': 'restored', role: 'status' }, [t('🏆 A win! The cats are back at full speed.')]));
  // count the points up, then slide the rows into their new places (Mario Kart's tension beat between races)
  const countUp = () => {
    const t0 = performance.now();
    const step = () => {
      if (!root.isConnected) return;
      const k = Math.min(1, (performance.now() - t0) / 700);
      for (const { fi, pts } of rows) pts.textContent = String(Math.round(run.points[fi] - (gained[fi] ?? 0) * (1 - k)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const slide = () => {
    for (const { fi, row } of rows) {
      row.classList.add('go');
      row.style.transform = `translateY(${now.indexOf(fi) * ROW_H}px)`;
      const pos = row.querySelector('.pos');
      if (pos) setTimeout(() => (pos.textContent = String(now.indexOf(fi) + 1)), reducedMotion() ? 0 : 450);
    }
    table.classList.add('moved');
  };
  if (reducedMotion()) {
    for (const { fi, pts } of rows) pts.textContent = String(run.points[fi]);
    slide();
  } else {
    setTimeout(countUp, 300);
    setTimeout(slide, 1050);
  }

  const quit = () =>
    void modal(t('Quit the cup?'), t('Your cup is saved. Resume it from the menu at the next race.'), [t('Quit'), t('Keep racing')], { focus: 1 }).then((i) => {
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
