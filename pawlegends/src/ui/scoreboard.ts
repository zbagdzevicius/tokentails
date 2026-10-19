/** Scoreboard (Tab, POC.md §9): both teams, levels, takedowns and knockouts counted from the event stream. */
import type { HeroId } from '../sim/api';
import type { ViewFrame } from '../render/interp';
import { HERO_COLOR_CSS } from '../render/palette';
import { HERO_TEXT, slotNames } from './heroText';
import { HEROES } from '../data/heroes';

/** A team's name by who is in it (sim v5 species teams): the cats are Purrhaven, the dogs the Woof pack. */
export function teamLabel(picks: readonly HeroId[], team: 0 | 1): string {
  const side = HEROES[picks[team * 3] ?? 'clem']?.side;
  return side === 'dog' ? 'Woof pack' : 'Purrhaven cats';
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export class Scoreboard {
  readonly root: HTMLElement;
  readonly kills = [0, 0, 0, 0, 0, 0];
  readonly deaths = [0, 0, 0, 0, 0, 0];
  /** Round 1: takedown credits seen (the sim's 'takedown' buff goes to the killer and every assist). */
  private readonly credits = [0, 0, 0, 0, 0, 0];
  /** Damage to enemy heroes seen in this team's snapshots (enemy numbers miss what happened out of sight). */
  readonly heroDmg = [0, 0, 0, 0, 0, 0];
  private readonly names: string[];

  constructor(
    parent: HTMLElement,
    private readonly picks: readonly HeroId[],
    private readonly mySlot: number,
    names?: readonly string[],
    /** Card skins (GDD §7.2): the cat each hero wears ('' = none), shown as "<Hero> · <cat>". */
    private readonly cats: readonly string[] = [],
  ) {
    this.names = names ? [...names] : slotNames(picks);
    this.root = document.createElement('div');
    this.root.className = 'pl-scoreboard';
    parent.appendChild(this.root);
  }

  /** A hero knockout: victim id, killer id (any entity). */
  death(victim: number, killer: number): void {
    if (victim >= 0 && victim < 6) this.deaths[victim]++;
    if (killer >= 0 && killer < 6) this.kills[killer]++;
  }

  /** A 'takedown' buff on a hero: it got the kill or an assist. */
  credit(id: number): void {
    if (id >= 0 && id < 6) this.credits[id]++;
  }

  /** A hit from hero `src` on enemy hero `dst`. */
  hit(src: number, dst: number, amount: number): void {
    if (src >= 0 && src < 6 && dst >= 0 && dst < 6 && (src < 3) !== (dst < 3)) this.heroDmg[src] += amount;
  }

  /** Assists: credits beyond the kills. */
  assists(slot: number): number {
    return Math.max(0, this.credits[slot] - this.kills[slot]);
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
            <td><i class="dot" style="background:${HERO_COLOR_CSS[hero]}"></i>${esc(this.names[slot] ?? t.title)}${this.cats[slot] ? ` <span class="cat">· ${esc(this.cats[slot])}</span>` : ''}${slot === this.mySlot ? ' <small>(you)</small>' : ''}</td>
            <td>${t.role}</td><td>${e?.level ?? '-'}</td><td>${this.kills[slot]} / ${this.deaths[slot]} / ${this.assists(slot)}</td><td>${this.heroDmg[slot]}</td>
            <td>${dead ? `${Math.ceil((e?.respawnIn ?? 0) / 30)} s` : e ? `${Math.round((e.hp / Math.max(1, e.maxHp)) * 100)}%` : 'hidden'}</td></tr>`;
        })
        .join('');
    const head = '<tr><th>Hero</th><th>Role</th><th>Lv</th><th title="Knockouts / knocked out / assists">K / D / A</th><th>Hero dmg</th><th>Health</th></tr>';
    this.root.innerHTML = `<div class="card"><h3 class="t0">${teamLabel(this.picks, 0)}${this.mySlot < 3 ? ' (you)' : ''}</h3><table>${head}${rows(0)}</table><h3 class="t1">${teamLabel(this.picks, 1)}</h3><table>${head}${rows(1)}</table><p class="hint">${document.documentElement.dataset.touch === '1' ? 'Tap to close' : 'Hold Tab'}</p></div>`;
  }

  dispose(): void {
    this.root.remove();
  }
}
