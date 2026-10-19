/**
 * The modes lane's section on the results screen (`registerResultSection`): what this race meant for the mode.
 * Grand Prix: points gained and the overall place. Time trial: medal, record and the ghost. Battle: the winner,
 * your balloons, pops and steals. Only numbers the game measured.
 */
import type { ResultCtx } from '../core/hud/results';
import { h } from '../ui/kit';
import { t } from '../ui/i18n';
import { cupById } from '../content/cups';
import { flow, fmt, fmtDelta } from './flow';
import { battleOf } from './battle/rules';

const MEDAL_NAME = ['', 'Bronze medal', 'Silver medal', 'Gold medal'];
const MEDAL_ICON = ['', '🥉', '🥈', '🥇'];

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${s}`;
}

export function modesResultSection(ctx: ResultCtx): HTMLElement | null {
  const f = flow();
  const box = h('div', { class: 'fm-m-res' });
  if (ctx.mode === 'gp' && f.lastGp) {
    const g = f.lastGp;
    const cup = cupById(g.cupId);
    box.append(
      h('p', { class: 'fm-m-res-big' }, [g.gained === 1 ? t('+1 point') : t('+{n} points', { n: g.gained })]),
      h('p', { class: 'fm-line' }, [t('{cup} · race {n} of {of} · {s} overall', { cup: t(cup?.name ?? ''), n: g.race + 1, of: cup?.races.length ?? 4, s: ordinal(g.standing) })]),
    );
    return box;
  }
  if (ctx.mode === 'tt' && f.lastTt) {
    const r = f.lastTt;
    if (r.time == null) {
      box.append(h('p', { class: 'fm-line' }, [t('No time: the run did not finish.')]));
      return box;
    }
    if (r.medal) box.append(h('p', { class: 'fm-m-res-big' }, [`${MEDAL_ICON[r.medal]} ${t(MEDAL_NAME[r.medal])}${r.medal > r.prevMedal && r.prevMedal ? ` · ${t('upgraded!')}` : ''}`]));
    if (r.newRecord) box.append(h('p', { class: 'fm-m-res-big' }, [r.prev != null ? t('New record! {d}', { d: fmtDelta(r.time - r.prev) }) : t('First record set!')]));
    else if (r.prev != null) box.append(h('p', { class: 'fm-line' }, [t('Your best: {t} ({d})', { t: fmt(r.prev), d: fmtDelta(r.time - r.prev) })]));
    if (r.ghostTime != null) {
      const d = r.time - r.ghostTime;
      // gold sits 2 % behind the dev time, so a gold run can still trail the dev ghost: say it as the next goal
      box.append(h('p', { class: 'fm-line' }, [d <= 0 ? t('You beat {g} by {s} s', { g: r.ghostLabel, s: Math.abs(d).toFixed(2) }) : r.medal === 3 ? t('Next goal: {g}, {s} s ahead', { g: r.ghostLabel, s: d.toFixed(2) }) : t('{g} was {s} s faster', { g: r.ghostLabel, s: d.toFixed(2) })]));
    }
    if (r.dev != null && r.medal < 3) {
      const [gold, silver, bronze] = f.medalTimes(r.dev);
      const target = r.medal === 2 ? gold : r.medal === 1 ? silver : bronze;
      const name = r.medal === 2 ? t('gold') : r.medal === 1 ? t('silver') : t('bronze');
      box.append(h('p', { class: 'fm-line' }, [t('{m} at {t}: {s} s to find', { m: name, t: fmt(target), s: (r.time - target).toFixed(2) })]));
    }
    return box;
  }
  if (ctx.mode === 'battle') {
    const w = f.shell.world;
    const b = w ? battleOf(w.st) : null;
    if (!w || !b) return null;
    const me = ctx.result.player.kart;
    const win = ctx.result.places[0];
    box.append(
      h('p', { class: 'fm-m-res-big' }, [win.kart === me ? t('You won the battle!') : t('{name} won the battle', { name: win.name })]),
      h('p', { class: 'fm-line' }, [
        b.pops[me] === 1 ? t('1 pop') : t('{n} pops', { n: b.pops[me] }),
        ' · ',
        b.steals[me] === 1 ? t('1 steal') : t('{n} steals', { n: b.steals[me] }),
        ' · ',
        b.outs[me] === 0 ? t('never popped') : b.outs[me] === 1 ? t('popped once') : t('popped {n} times', { n: b.outs[me] }),
      ]),
    );
    return box;
  }
  return null;
}
