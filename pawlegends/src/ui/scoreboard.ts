/** Scoreboard (Tab, POC.md §9): both teams, levels, takedowns and knockouts counted from the event stream. */
import type { HeroId } from '../sim/api';
import type { ViewFrame } from '../render/interp';
import { HERO_COLOR_CSS } from '../render/palette';
import { HERO_TEXT } from './heroText';

export class Scoreboard {
  readonly root: HTMLElement;
  readonly kills = [0, 0, 0, 0, 0, 0];
  readonly deaths = [0, 0, 0, 0, 0, 0];

  constructor(
    parent: HTMLElement,
    private readonly picks: readonly HeroId[],
    private readonly mySlot: number,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'pl-scoreboard';
    parent.appendChild(this.root);
  }

  /** A hero knockout: victim id, killer id (any entity). */
  death(victim: number, killer: number): void {
    if (victim >= 0 && victim < 6) this.deaths[victim]++;
    if (killer >= 0 && killer < 6) this.kills[killer]++;
  }

  show(on: boolean, frame: ViewFrame | null): void {
    this.root.classList.toggle('on', on);
    if (!on) return;
    const rows = (team: 0 | 1): string =>
      [0, 1, 2]
        .map((k) => {
          const slot = team * 3 + k;
          const hero = this.picks[slot];
          const e = frame?.byId.get(slot);
          const dead = e?.state === 'dead';
          const t = HERO_TEXT[hero];
          return `<tr class="${slot === this.mySlot ? 'me' : ''}${dead ? ' dead' : ''}">
            <td><i class="dot" style="background:${HERO_COLOR_CSS[hero]}"></i>${t.title}${slot === this.mySlot ? ' <small>(you)</small>' : ''}</td>
            <td>${t.role}</td><td>${e?.level ?? '-'}</td><td>${this.kills[slot]}</td><td>${this.deaths[slot]}</td>
            <td>${dead ? `${Math.ceil((e?.respawnIn ?? 0) / 30)} s` : e ? `${Math.round((e.hp / Math.max(1, e.maxHp)) * 100)}%` : 'hidden'}</td></tr>`;
        })
        .join('');
    const head = '<tr><th>Hero</th><th>Role</th><th>Lv</th><th>Takedowns</th><th>Knocked out</th><th>Health</th></tr>';
    this.root.innerHTML = `<div class="card"><h3 class="t0">Purrhaven</h3><table>${head}${rows(0)}</table><h3 class="t1">Woof</h3><table>${head}${rows(1)}</table><p class="hint">Hold Tab</p></div>`;
  }

  dispose(): void {
    this.root.remove();
  }
}
