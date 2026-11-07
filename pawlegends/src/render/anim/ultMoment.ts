/**
 * Ult moments (ANIM-SPEC §8). Own ult: a zoom punch, a 110 ms slow-mo, the ult name and the hero's name on the top
 * rail, a sting and a soft gold flash (no flash, punch or slow-mo under reduce motion). An enemy ult aimed at or near me: a red edge vignette for 300 ms and a name chip,
 * no slow-mo. An ally ult: the sting at 60% volume only. DOM nodes are made once and reused.
 *
 * LoL pass (lane A): the own ult is a gold note on the top rail on every screen (the old skewed band covered the score
 * bar and the rail on desktop, QA v2 #1); desktop draws it as a big announcer line. The enemy ult chip is a prio 1 rail
 * note ("Enemy ult: <name>") with the red edge vignette.
 */
import { claimScreen } from '../fx/screenLayer';
import { sfx } from '../../audio/sfx';
import type { Note } from '../../ui/notifyQueue';
import type { FightCam } from './cam';

export interface UltJuice {
  slowmo(ms: number, scale: number): void;
  flash(kind: 'white' | 'gold' | 'red'): void;
  /** Records the text like a callout does (e2e reads data-said). */
  note(text: string): void;
  /** A note on the top rail (records it as said too). */
  push?(n: Note): boolean;
}

const touchUi = (): boolean => {
  try {
    return document.documentElement.dataset.touch === '1';
  } catch {
    return false;
  }
};

const CSS = `
.pl-ult-vig{position:absolute;inset:0;pointer-events:none;z-index:5;box-shadow:inset 0 0 80px 20px #ff3040;opacity:0}
.pl-ult-vig.on{animation:pl-ult-vig .3s ease-out}
@keyframes pl-ult-vig{0%{opacity:.85}100%{opacity:0}}
`;

export class UltMoment {
  private vig: HTMLElement | null = null;
  reduced = false;

  constructor(
    ui: HTMLElement | null,
    private readonly juice: UltJuice,
    private readonly cam: FightCam | null,
  ) {
    if (!ui || typeof document === 'undefined') return;
    if (!document.getElementById('pl-ult-css')) {
      const st = document.createElement('style');
      st.id = 'pl-ult-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.vig = document.createElement('div');
    this.vig.className = 'pl-ult-vig';
    ui.append(this.vig);
  }

  private restart(el: HTMLElement | null, cls: string): void {
    if (!el) return;
    el.className = cls;
    void el.offsetWidth;
    el.className = `${cls} on`;
  }

  /** The player's own ult: a gold announcer note on the top rail (big on desktop), never a band over the field. */
  own(heroName: string, ultName: string, color: number): void {
    void color;
    if (this.juice.push) this.juice.push({ key: 'own-ult', title: ultName, sub: heroName, tone: 'gold', prio: 2, ttl: 1400, big: !touchUi() });
    else this.juice.note(ultName);
    if (!this.reduced) {
      this.cam?.punch(0.05);
      this.juice.slowmo(110, 0.6);
      this.juice.flash('gold');
    }
    sfx.play('sting', { vol: 0.9 });
  }

  /** An enemy ult aimed at or near the player. */
  enemy(ultName: string): void {
    if (this.juice.push) this.juice.push({ key: 'enemy-ult', title: `Enemy ult: ${ultName}`, tone: 'bad', prio: 1, ttl: 1600, cooldown: 1500 });
    this.juice.note(ultName);
    // GFX-10: the red edge only when no other full-screen layer shows (the rail note above always does)
    if (claimScreen(300)) this.restart(this.vig, 'pl-ult-vig');
  }

  /** An ally ult: only the sting, softer. */
  ally(at: { x: number; z: number }): void {
    sfx.play('sting', { vol: 0.6, at });
  }

  dispose(): void {
    this.vig?.remove();
  }
}
