/**
 * Talent picker (POC.md §6.1, §9): at levels 3, 6 and 9 a card with two big options; keys 1 and 2 on desktop, tap
 * on touch. Offers queue if a second one arrives first. Bots take the first option inside the sim.
 */
import { HEROES } from '../data/heroes';
import type { HeroId, TalentTier } from '../sim/api';
import { HERO_TEXT } from './heroText';

const LEVEL_OF_TIER = [3, 6, 9];

export class TalentPicker {
  readonly root: HTMLElement;
  private queue: TalentTier[] = [];
  private picked = new Set<number>();

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

  offer(tier: number): void {
    if (tier < 0 || tier > 2 || this.picked.has(tier) || this.queue.includes(tier as TalentTier)) return;
    this.queue.push(tier as TalentTier);
    if (this.queue.length === 1) this.render();
  }

  /** Returns true when a card was open. */
  pick(choice: 0 | 1): boolean {
    const tier = this.queue.shift();
    if (tier === undefined) return false;
    this.picked.add(tier);
    this.choose(tier, choice);
    this.render();
    return true;
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
    this.root.innerHTML = `<div class="head">Level ${LEVEL_OF_TIER[tier]} talent</div>${opts
      .map((o, i) => `<button data-c="${i}"><kbd>${i + 1}</kbd><b>${o.name}</b><span>${words[o.id] ?? ''}</span></button>`)
      .join('')}`;
    this.root.classList.add('on');
  }

  dispose(): void {
    this.root.remove();
  }
}
