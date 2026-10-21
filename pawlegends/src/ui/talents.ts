/**
 * Talent picker (POC.md §6.1, §9): at levels 3, 6 and 9 a compact strip with two options; keys 1 and 2 on desktop,
 * tap on touch. It sits clear of the hero (above the ability bar on desktop, under the hero box on touch) and never
 * blocks the fight: when the player does not choose within `TALENT_AUTO_S` match seconds, option 1 is taken for them
 * (the same default the bots take inside the sim), and a bar on the strip shows the time left. Offers queue if a
 * second one arrives first.
 *
 * Round 0: an offer that comes mid-fight waits (`offer(tier, true)`): the portrait glows "Talent!" and the cards
 * open on a tap on it, or on their own once the player is out of the fight (`reveal`). Small screens show a 2-5
 * word subtitle (heroText TALENT_SHORT) instead of the full line, which was cut off.
 */
import { BRANCH_TALENT, HEROES } from '../data/heroes';
import type { HeroId, TalentTier } from '../sim/api';
import { HERO_TEXT, TALENT_SHORT } from './heroText';

const LEVEL_OF_TIER = [3, 6, 9];
/** Seconds (unpaused) an offer stays open before option 1 is picked for the player. */
export const TALENT_AUTO_S = 10;

export class TalentPicker {
  readonly root: HTMLElement;
  private queue: TalentTier[] = [];
  private picked = new Set<number>();
  private left = TALENT_AUTO_S;
  /** Tiers picked by the timeout, not by the player (analytics may tell them apart). */
  readonly auto: number[] = [];

  constructor(
    parent: HTMLElement,
    private readonly hero: HeroId,
    private readonly choose: (tier: TalentTier, choice: 0 | 1) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'pl-talents';
    parent.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      e.stopPropagation();
      e.preventDefault();
      this.pick(Number(b.dataset.c) as 0 | 1);
    });
  }

  get open(): boolean {
    return this.queue.length > 0;
  }

  /** An offer is waiting behind the glowing portrait (not shown yet). */
  waiting = false;

  /** `wait`: the player is fighting, so only the portrait glows until `reveal()`. */
  offer(tier: number, wait = false): void {
    if (tier < 0 || tier > 2 || this.picked.has(tier) || this.queue.includes(tier as TalentTier)) return;
    this.queue.push(tier as TalentTier);
    if (this.queue.length !== 1) return;
    if (wait) {
      this.waiting = true;
      this.root.classList.remove('on');
      this.onWait?.(true);
    } else this.render();
  }

  /** Show a waiting offer (a tap on the portrait, or the fight is over). */
  reveal(): void {
    if (!this.waiting) return;
    this.waiting = false;
    this.onWait?.(false);
    this.render();
  }

  /** The session glows the portrait while an offer waits. */
  onWait?: (on: boolean) => void;

  /** Returns true when a card was open. */
  pick(choice: 0 | 1, auto = false): boolean {
    const tier = this.queue.shift();
    if (tier === undefined) return false;
    this.picked.add(tier);
    if (auto) this.auto.push(tier);
    this.choose(tier, choice);
    this.render();
    return true;
  }

  /** Advance the auto-pick timer (call with 0 while paused). */
  update(dt: number): void {
    if (!this.open || this.waiting) return;
    this.left -= dt;
    const bar = this.root.querySelector<HTMLElement>('.time');
    if (bar) bar.style.setProperty('--left', Math.max(0, this.left / TALENT_AUTO_S).toFixed(3));
    if (this.left <= 0) this.pick(0, true);
  }

  private lastAt = -1;
  /**
   * Round 2 (a card stayed open 12 to 20 s on a slow phone: frame dt is clamped, so summed dt ran slow): advance the
   * timer by wall-clock time × `speed` (match speed), at most 1 s a call; `running` false (paused, ended) holds it.
   */
  tick(running: boolean, speed: number, now: number = performance.now()): void {
    const last = this.lastAt;
    this.lastAt = now;
    if (!running || last < 0) return;
    this.update(Math.min(1, Math.max(0, (now - last) / 1000)) * speed);
  }

  /** Seconds before the open offer is auto-picked (tests). */
  get timeLeft(): number {
    return this.open ? Math.max(0, this.left) : 0;
  }

  private render(): void {
    const tier = this.queue[0];
    if (tier === undefined) {
      this.root.classList.remove('on');
      this.root.innerHTML = '';
      return;
    }
    const opts = HEROES[this.hero].talents[tier];
    const words = HERO_TEXT[this.hero].talents;
    // GAPS B6: level 6 is where the shape branches are listed. A hero with one tags it; the rest say it is coming.
    const branch = tier === 1 ? BRANCH_TALENT[this.hero] : null;
    const soon = tier === 1 && !branch ? '<span class="soon">Branch coming soon</span>' : '';
    this.left = TALENT_AUTO_S;
    this.root.innerHTML = `<div class="head">Level ${LEVEL_OF_TIER[tier]} talent: pick one${soon}</div><i class="time"></i>${opts
      .map((o, i) => `<button data-c="${i}"${o.id === branch ? ' class="branch"' : ''}><kbd>${i + 1}</kbd><b>${o.name}${o.id === branch ? '<em class="tag">New shape</em>' : ''}</b><span class="d">${words[o.id] ?? ''}</span><span class="s">${TALENT_SHORT[o.id] ?? words[o.id] ?? ''}</span></button>`)
      .join('')}`;
    this.root.classList.add('on');
  }

  dispose(): void {
    this.root.remove();
  }
}
