/** Scoreboard (Tab, POC.md §9): both teams, levels, takedowns and knockouts counted from the event stream. */
import type { HeroId } from '../sim/api';
import type { ViewFrame } from '../render/interp';
import { HERO_COLOR_CSS } from '../render/palette';
import { HERO_TEXT, slotNames } from './heroText';
import { HEROES } from '../data/heroes';
// cards: each row's hero as a 32x44 mini Token Tails card (element art and portrait)
import { portraitUrl } from '../render/portraits';
import { cardAttrs, heroElement } from './cards/el';
import { TOY_TIERS } from '../data/toys';
import { icon } from './icons';
import type { IconId } from './heroText';
import { flagHtml } from '../social/report';

/** A team's name by who is in it (sim v5 species teams): the cats are Purrhaven, the dogs the Woof pack. */
export function teamLabel(picks: readonly HeroId[], team: 0 | 1): string {
  // sim v19: 3 a side on Crossing, 5 on Hearthwood (picks hold both teams)
  const side = HEROES[picks[team * Math.max(1, picks.length >> 1)] ?? 'clem']?.side;
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

/**
 * Lane F (F2): a hero's Toy tiers as four pips (the snapshot's `toy`, both teams; an enemy's buy lights one), "?" when
 * the hero is out of sight. Pure.
 */
export function toyPips(toy: number | undefined): string {
  if (toy === undefined) return '<i class="tp unk" title="Hidden">?</i>';
  const t = Math.max(0, Math.min(TOY_TIERS, toy));
  let h = '';
  for (let i = 0; i < TOY_TIERS; i++) h += `<i class="tp${i < t ? ' on' : ''}"></i>`;
  return `<span class="toys" data-toy="${t}" title="${t} of ${TOY_TIERS} Toys">${h}</span>`;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Sim v19 (Hearthwood): a role's scoreboard label and its glyph. */
export const ROLE_LABEL: Readonly<Record<string, { name: string; glyph: IconId }>> = Object.freeze({
  solo: { name: 'Solo · Fenceline', glyph: 'shield' },
  mid: { name: 'Mid · Yarn Road', glyph: 'spark' },
  fish: { name: 'Fish · Gutterway', glyph: 'tuna' },
  prowl: { name: 'Prowl · Jungle', glyph: 'paw' },
  guard: { name: 'Guard · Support', glyph: 'heart' },
});
/** A role chip (icon and short name), or '' on Crossing. Pure. */
export function roleChip(role: string | undefined): string {
  const r = ROLE_LABEL[role ?? ''];
  return r ? `<span class="sb-role" data-role="${role}" title="${esc(r.name)}">${icon(r.glyph)}</span>` : '';
}

export class Scoreboard {
  readonly root: HTMLElement;
  readonly kills = new Array<number>(10).fill(0);
  readonly deaths = new Array<number>(10).fill(0);
  /** Round 1: takedown credits seen (the sim's 'takedown' buff goes to the killer and every assist). */
  private readonly credits = new Array<number>(10).fill(0);
  /** Damage to enemy heroes seen in this team's snapshots (enemy numbers miss what happened out of sight). */
  readonly heroDmg = new Array<number>(10).fill(0);
  /** Heroes per team (3, or 5 on Hearthwood). */
  private readonly per: number;
  /** Sim v19 (Hearthwood): each slot's bot role (rolesOf), shown as a glyph; empty on Crossing. */
  roles: readonly string[] = [];
  private names: string[];
  /**
   * Party play (MULTIPLAYER.md §7 M1, M3): friends' rows get a ring badge, a connection dot and a "bot" chip while a
   * bot flies them; a tap on a friend's name mutes or unmutes them (`onMute`). Null in solo matches.
   */
  seats: ReadonlyMap<number, { ring: string; bot: boolean; conn: 'on' | 'away' | 'off'; muted: boolean }> | null = null;
  onMute: ((slot: number) => void) | null = null;
  /**
   * PvP reports (SOCIAL-RANKED.md §8.1): a flag at the end of every human row but your own; `open` shows the reason
   * chips. Null outside PvP (no flags at all). Bot rows never get one (`can` is false for them).
   */
  report: { can(slot: number): boolean; done(slot: number): boolean; open(slot: number, anchor: HTMLElement): void } | null = null;
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
    this.per = Math.max(1, picks.length >> 1);
    this.root = document.createElement('div');
    this.root.className = 'pl-scoreboard';
    if (this.per > 3) this.root.dataset.size = String(this.per);
    // registered first, so a tap on a friend's name mutes them instead of closing the board (matchSession)
    this.root.addEventListener('pointerdown', (e) => {
      const f = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-report]');
      if (f && this.report) {
        e.stopImmediatePropagation();
        e.preventDefault();
        const slot = Number(f.dataset.report);
        if (!f.hasAttribute('disabled') && this.report.can(slot) && !this.report.done(slot)) this.report.open(slot, f);
        return;
      }
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

  /** The report flag of a row ('' outside PvP, on bots and on your own row). */
  private flag(slot: number): string {
    if (!this.report || slot === this.mySlot || !this.report.can(slot)) return '';
    return flagHtml(slot, this.names[slot] ?? 'player', this.report.done(slot));
  }

  /** A hero knockout: victim id, killer id (any entity). */
  death(victim: number, killer: number): void {
    const n = this.picks.length;
    if (victim >= 0 && victim < n) this.deaths[victim]++;
    if (killer >= 0 && killer < n) this.kills[killer]++;
  }

  /** A 'takedown' buff on a hero: it got the kill or an assist. */
  credit(id: number): void {
    if (id >= 0 && id < this.picks.length) this.credits[id]++;
  }

  /** A hit from hero `src` on enemy hero `dst`. */
  hit(src: number, dst: number, amount: number): void {
    const n = this.picks.length;
    if (src >= 0 && src < n && dst >= 0 && dst < n && (src < this.per) !== (dst < this.per)) this.heroDmg[src] += amount;
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
      Array.from({ length: this.per }, (_, k) => k)
        .map((k) => {
          const slot = team * this.per + k;
          const role = ROLE_LABEL[this.roles[slot] ?? ''];
          const hero = this.picks[slot];
          const e = frame?.byId.get(slot);
          const dead = e?.state === 'dead';
          const t = HERO_TEXT[hero];
          const flag = this.flag(slot);
          return `<tr class="${slot === this.mySlot ? 'me' : ''}${dead ? ' dead' : ''}${this.seats?.has(slot) ? ' friend' : ''}" data-slot="${slot}">
            <td${flag ? ' class="sb-rp"' : ''}><i class="dot tt-sb" ${cardAttrs(heroElement(hero))} style="--dot:${HERO_COLOR_CSS[hero]};--pic:var(--pic${slot}, none)"></i>${this.nameHtml(slot, this.names[slot] ?? t.title)}${this.seatHtml(slot)}${this.cats[slot] ? ` <span class="cat">· ${esc(this.cats[slot])}</span>` : ''}${slot === this.mySlot ? ' <small>(you)</small>' : ''}${flag}</td>
            <td>${role ? `${roleChip(this.roles[slot])} ` : ''}${t.role}</td><td class="lv">${e?.level ?? '-'}</td><td class="kda">${this.kills[slot]} / ${this.deaths[slot]} / ${this.assists(slot)}</td><td class="tal">${talentChips(hero, e?.talents)}</td><td class="toy">${toyPips(e?.toy)}</td><td>${this.heroDmg[slot]}</td></tr>`;
        })
        .join('');
    const head = '<tr><th>Hero</th><th>Role</th><th>Lv</th><th title="Knockouts / knocked out / assists">K / D / A</th><th>Talents</th><th>Toys</th><th>Hero dmg</th></tr>';
    this.root.innerHTML = `<div class="card lol"><h3 class="t0">${teamLabel(this.picks, 0)}${this.mySlot < this.per ? ' (you)' : ''}</h3><table>${head}${rows(0)}</table><h3 class="t1">${teamLabel(this.picks, 1)}</h3><table>${head}${rows(1)}</table><p class="hint">${document.documentElement.dataset.touch === '1' ? 'Tap to close' : 'Hold Tab'}</p></div>`;
  }

  dispose(): void {
    this.root.remove();
  }
}
