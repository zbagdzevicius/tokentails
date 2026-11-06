/** Scoreboard (Tab, POC.md §9): both teams, levels, takedowns and knockouts counted from the event stream. */
import type { HeroId } from '../sim/api';
import type { ViewFrame } from '../render/interp';
import { HERO_COLOR_CSS } from '../render/palette';
import { HERO_TEXT, slotNames } from './heroText';
import { HEROES } from '../data/heroes';
// cards: each row's hero as a 32x44 mini Token Tails card (element art and portrait)
import { portraitUrl } from '../render/portraits';
import { cardAttrs, heroElement } from './cards/el';

/** A team's name by who is in it (sim v5 species teams): the cats are Purrhaven, the dogs the Woof pack. */
export function teamLabel(picks: readonly HeroId[], team: 0 | 1): string {
  const side = HEROES[picks[team * 3] ?? 'clem']?.side;
  return side === 'dog' ? 'Woof pack' : 'Purrhaven cats';
}

/**
 * LoL pass (lane B): the talent-picks column, three small chips (levels 3, 6, 9): the pick's initial with its name as
 * the tooltip, an empty ring for a tier not picked yet, a dim "?" where the snapshot hides the other team's picks. Pure.
 */
export function talentChips(hero: HeroId, talents: readonly number[] | undefined): string {
  const tiers = HEROES[hero]?.talents ?? [];
  return [0, 1, 2]
    .map((t) => {
      if (!talents) return '<i class="tc unk" title="Hidden">?</i>';
      const c = talents[t] ?? -1;
      const opt = c >= 0 ? tiers[t]?.[c] : undefined;
      if (!opt) return `<i class="tc none" title="Level ${[3, 6, 9][t]}: not picked"></i>`;
      return `<i class="tc" title="Level ${[3, 6, 9][t]}: ${esc(opt.name)}">${esc(opt.name.charAt(0))}</i>`;
    })
    .join('');
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
  private names: string[];
  /**
   * Party play (MULTIPLAYER.md §7 M1, M3): friends' rows get a ring badge, a connection dot and a "bot" chip while a
   * bot flies them; a tap on a friend's name mutes or unmutes them (`onMute`). Null in solo matches.
   */
  seats: ReadonlyMap<number, { ring: string; bot: boolean; conn: 'on' | 'away' | 'off'; muted: boolean }> | null = null;
  onMute: ((slot: number) => void) | null = null;
  /** cards: the slots whose portrait is already on the root as `--pic<slot>` (data URLs are set once, not per redraw). */
  private readonly pics = new Set<number>();

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
    // registered first, so a tap on a friend's name mutes them instead of closing the board (matchSession)
    this.root.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-mute]');
      if (!b || !this.onMute) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      this.onMute(Number(b.dataset.mute));
    });
    parent.appendChild(this.root);
  }

  /** Party play: names changed (a friend joined, was muted, Hide names). */
  setNames(names: readonly string[]): void {
    this.names = [...names];
  }

  private seatHtml(slot: number): string {
    const seat = this.seats?.get(slot);
    if (!seat || slot === this.mySlot) return '';
    const conn = seat.conn === 'on' ? 'Here' : seat.conn === 'away' ? 'Away' : 'Offline';
    return ` <i class="sb-ring" style="--ring:${seat.ring}" title="Friend"></i><i class="sb-conn" data-conn="${seat.conn}" title="${conn}"></i>${seat.bot ? ' <span class="sb-bot">bot</span>' : ''}${seat.muted ? ' <span class="sb-muted">muted</span>' : ''}`;
  }

  private nameHtml(slot: number, text: string): string {
    const seat = this.seats?.get(slot);
    if (!seat || slot === this.mySlot || !this.onMute) return esc(text);
    return `<button type="button" class="sb-name" data-mute="${slot}" aria-label="${esc(`${seat.muted ? 'Unmute' : 'Mute'} ${text}`)}" title="${seat.muted ? 'Tap to unmute' : 'Tap to mute'}">${esc(text)}</button>`;
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
    for (let slot = 0; slot < this.picks.length; slot++) {
      if (this.pics.has(slot)) continue;
      const pic = portraitUrl(this.picks[slot]);
      if (!pic) continue;
      this.pics.add(slot);
      this.root.style.setProperty(`--pic${slot}`, `url(${pic})`);
    }
    const rows = (team: 0 | 1): string =>
      [0, 1, 2]
        .map((k) => {
          const slot = team * 3 + k;
          const hero = this.picks[slot];
          const e = frame?.byId.get(slot);
          const dead = e?.state === 'dead';
          const t = HERO_TEXT[hero];
          return `<tr class="${slot === this.mySlot ? 'me' : ''}${dead ? ' dead' : ''}${this.seats?.has(slot) ? ' friend' : ''}" data-slot="${slot}">
            <td><i class="dot tt-sb" ${cardAttrs(heroElement(hero))} style="--dot:${HERO_COLOR_CSS[hero]};--pic:var(--pic${slot}, none)"></i>${this.nameHtml(slot, this.names[slot] ?? t.title)}${this.seatHtml(slot)}${this.cats[slot] ? ` <span class="cat">· ${esc(this.cats[slot])}</span>` : ''}${slot === this.mySlot ? ' <small>(you)</small>' : ''}</td>
            <td>${t.role}</td><td class="lv">${e?.level ?? '-'}</td><td class="kda">${this.kills[slot]} / ${this.deaths[slot]} / ${this.assists(slot)}</td><td class="tal">${talentChips(hero, e?.talents)}</td><td>${this.heroDmg[slot]}</td>
            <td>${dead ? `${Math.ceil((e?.respawnIn ?? 0) / 30)} s` : e ? `${Math.round((e.hp / Math.max(1, e.maxHp)) * 100)}%` : 'hidden'}</td></tr>`;
        })
        .join('');
    const head = '<tr><th>Hero</th><th>Role</th><th>Lv</th><th title="Knockouts / knocked out / assists">K / D / A</th><th>Talents</th><th>Hero dmg</th><th>Health</th></tr>';
    this.root.innerHTML = `<div class="card lol"><h3 class="t0">${teamLabel(this.picks, 0)}${this.mySlot < 3 ? ' (you)' : ''}</h3><table>${head}${rows(0)}</table><h3 class="t1">${teamLabel(this.picks, 1)}</h3><table>${head}${rows(1)}</table><p class="hint">${document.documentElement.dataset.touch === '1' ? 'Tap to close' : 'Hold Tab'}</p></div>`;
  }

  dispose(): void {
    this.root.remove();
  }
}
