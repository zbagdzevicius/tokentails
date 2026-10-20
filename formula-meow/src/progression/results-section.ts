/**
 * The progression block on the results screen: fish earned (counting up, with the reasons), what just unlocked,
 * achievements, today's three challenges, the rival record, the next thing to buy, and doors to the garage, awards
 * and stats. Compact: a phone shows it between the standings and the sticky buttons.
 */
import type { Shell } from '../core/app/shell';
import type { ResultCtx } from '../core/hud/results';
import { h } from '../ui/kit';
import { t } from '../ui/i18n';
import { reducedMotion } from '../ui/a11y';
import { screens } from '../core/app/screens';
import { trackById } from '../core/track/tracks';
import { CLASSES } from '../tuning';
import { ACHIEVEMENT_IDS } from '../content/ids';
import { TRAIL_INFO } from '../content/cosmetics';
import { PINK_PAW_CATS } from '../share/pinkpaw/pink-paw';
import { achievementById } from './achievements';
import { challengeById } from './challenges';
import { nextGoal } from './economy';
import { lastAward } from './last';
import { prog } from './store';
import type { Award } from './record';
import type { UnlockNews } from './unlocks';

export function unlockLabel(u: UnlockNews): string {
  switch (u.kind) {
    case 'class': {
      const c = CLASSES[Number(u.id) as 0 | 1 | 2];
      return t('{c} unlocked', { c: c ? `${c.name} ${c.cc}` : u.id });
    }
    case 'mirror':
      return t('Mirror mode unlocked');
    case 'cup':
      return t('Catnip Cup unlocked');
    case 'mode':
      return t('Balloon Battle unlocked');
    case 'trail': {
      const info = TRAIL_INFO[u.id as keyof typeof TRAIL_INFO];
      return t('New trail: {icon} {name}', { icon: info?.icon ?? '', name: t(info?.name ?? u.id) });
    }
    case 'cat': {
      const cat = PINK_PAW_CATS.find((c) => c.id === u.id);
      return t('{name} joins your team', { name: cat?.name ?? '?' });
    }
  }
}

/** Count a number up in an element (instant under reduced motion). */
export function countUp(el: HTMLElement, from: number, to: number, ms = 900, fmt = (n: number) => String(n)): void {
  if (reducedMotion() || to === from || typeof requestAnimationFrame === 'undefined') {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - (1 - k) * (1 - k);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = fmt(from);
  requestAnimationFrame(step);
}

/** One chip per reason; repeats fold into one ("Achievement ×3 +75"). */
export function fishChips(a: Award): HTMLElement[] {
  const rows: Array<{ label: string; n: number; amount: number }> = [];
  for (const f of a.fish) {
    const label = t(f.key, f.vars);
    const r = rows.find((x) => x.label === label);
    if (r) {
      r.n++;
      r.amount += f.amount;
    } else rows.push({ label, n: 1, amount: f.amount });
  }
  return rows.map((r) => h('span', { class: 'fm-prog-chip' }, [`${r.label}${r.n > 1 ? ` ×${r.n}` : ''} +${r.amount}`]));
}

function fishBlock(a: Award, before: number): HTMLElement {
  const total = h('b', { class: 'fm-prog-plus' }, ['+0']);
  const bal = h('span', { class: 'fm-prog-bal', 'aria-label': t('Fish coins') }, [`🐟 ${before}`]);
  // one line of chips; the rest behind a "+N more" chip (a wrapped wall of chips was clipped by the button row)
  const chips = fishChips(a);
  // two chips and the "+N more" fit one line on a 390 px phone (three wrapped the "more" chip under the row, B2)
  const SHOW = chips.length <= 3 ? 3 : 2;
  const reasons = h('div', { class: 'fm-prog-reasons one' }, chips.slice(0, SHOW));
  if (chips.length > SHOW) {
    const more = h('button', { class: 'fm-prog-chip fm-prog-more', type: 'button' }, [t('+{n} more', { n: chips.length - SHOW })]);
    more.addEventListener('click', () => {
      more.remove();
      reasons.classList.remove('one');
      reasons.append(...chips.slice(SHOW));
    });
    reasons.append(more);
  }
  const row = h('div', { class: 'fm-prog-fish' }, [h('span', { class: 'fm-prog-icon', 'aria-hidden': 'true' }, ['🐟']), total, bal]);
  countUp(total, 0, a.total, 700, (n) => `+${n}`);
  countUp(bal, before, before + a.total, 900, (n) => `🐟 ${n}`);
  return h('div', {}, [row, a.fish.length ? reasons : h('p', { class: 'fm-line fm-prog-dim' }, [t('Finish in the top 8 and pick up fish coins to earn fish.')])]);
}

function dailyBlock(a: Award): HTMLElement | null {
  const d = prog().daily;
  if (d.ids.length !== 3) return null;
  const rows = d.ids.map((id, i) => {
    const c = challengeById(id, (tid) => trackById(tid).name);
    if (!c) return null;
    const p = Math.min(c.target, d.progress[i] ?? 0);
    const done = !!d.done[i];
    const fresh = a.challenges.includes(i);
    return h('div', { class: `fm-prog-ch${done ? ' done' : ''}${fresh ? ' fresh' : ''}` }, [
      h('span', { class: 'mark', 'aria-hidden': 'true' }, [done ? '✓' : '○']),
      h('span', { class: 'txt' }, [t(c.text, c.vars)]),
      h('span', { class: 'n' }, [done ? `+${c.fish}` : `${p}/${c.target}`]),
      h('i', { class: 'bar', style: `width:${Math.round((p / c.target) * 100)}%` }),
    ]);
  });
  return h('div', { class: 'fm-prog-daily', role: 'group', 'aria-label': t('Daily challenges') }, [h('h3', {}, [t('Daily challenges'), d.streak > 1 ? h('span', { class: 'fm-prog-streak' }, [t('{n}-day streak', { n: d.streak })]) : null]), ...rows]);
}

function goalBlock(): HTMLElement | null {
  const g = nextGoal(prog());
  if (!g) return null;
  const name = t(g.item.name);
  const pct = Math.round(Math.min(1, prog().fish / g.item.price) * 100);
  return h('div', { class: 'fm-prog-goal' }, [
    h('span', {}, [g.affordable ? t('You can buy the {name}!', { name }) : t('{n} fish to {name}', { n: g.missing, name })]),
    h('span', { class: 'fm-prog-meter', role: 'meter', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': t('Next goal') }, [h('i', { style: `width:${pct}%` })]),
  ]);
}

export function renderProgressSection(ctx: ResultCtx, shell: Shell): HTMLElement | null {
  const la = lastAward();
  if (!la || la.token !== shell.raceToken) return null;
  const a = la.award;
  if (ctx.result.seed !== la.seed) return null;
  const parts: Array<HTMLElement | null> = [fishBlock(a, la.fishBefore)];
  // a new class already has the shell's own "race it" button above
  const news = a.unlocks.filter((u) => u.kind !== 'class').map(unlockLabel);
  if (a.newBestLap != null) news.unshift(t('New best lap!'));
  if (news.length) parts.push(h('div', { class: 'fm-prog-news' }, news.map((n) => h('span', { class: 'fm-prog-chip gold' }, [`🎉 ${n}`]))));
  if (a.achievements.length)
    parts.push(
      h(
        'div',
        { class: 'fm-prog-ach' },
        a.achievements.map((id) => {
          const d = achievementById(id);
          return h('span', { class: 'fm-prog-badge', title: d ? t(d.desc) : '' }, [`${d?.icon ?? '🏆'} ${d ? t(d.name) : id}`]);
        }),
      ),
    );
  if (a.rival) {
    const r = a.rival;
    parts.push(
      h('p', { class: `fm-line fm-prog-rival${r.won ? ' won' : ''}` }, [
        r.won ? t('You beat your rival {name}!', { name: r.name }) : t('Your rival {name} beat you.', { name: r.name }),
        ' ',
        h('b', {}, [t('Head to head: you {w} · {name} {l}', { w: r.w, l: r.l, name: r.name })]),
      ]),
    );
  }
  // polish 2: the daily challenges, the next goal and the garage / awards / stats doors fold under one "More"
  // line (open when a challenge was just completed), so the results column stays short
  const s = prog();
  const fresh = s.fresh.length > 0 || nextGoal(s)?.affordable;
  const more = h('details', { class: 'fm-prog-moreinfo' }, [
    h('summary', {}, [t('Challenges, goals and garage')]),
    dailyBlock(a),
    goalBlock(),
    h('div', { class: 'fm-prog-links' }, [
      h('button', { class: `fm-btn fm-prog-link${fresh ? ' hot' : ''}`, type: 'button', 'data-act': 'garage', onclick: () => void screens.push('garage') }, [t('🏎️ Garage')]),
      h('button', { class: 'fm-btn fm-prog-link', type: 'button', 'data-act': 'awards', onclick: () => void screens.push('achievements') }, [
        t('🏆 {n}/{of}', { n: Object.keys(s.achievements).length, of: ACHIEVEMENT_IDS.length }),
      ]),
      h('button', { class: 'fm-btn fm-prog-link', type: 'button', 'data-act': 'stats', 'aria-label': t('Stats'), onclick: () => void screens.push('stats') }, [t('📊 Stats')]),
    ]),
  ]);
  if (a.challenges.length || fresh) (more as HTMLDetailsElement).open = true;
  parts.push(more);
  return h('div', { class: 'fm-prog-res', 'data-section': 'progression' }, parts.filter((p): p is HTMLElement => !!p));
}
