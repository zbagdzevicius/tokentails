/**
 * Ult moments (ANIM-SPEC §8). Own ult: a zoom punch, a 110 ms slow-mo, a 900 ms diagonal banner in the element colour
 * with the hero's name and the ult name (it replaces the old callout), a sting and a soft gold flash (no flash, punch
 * or slow-mo under reduce motion). An enemy ult aimed at or near me: a red edge vignette for 300 ms and a name chip,
 * no slow-mo. An ally ult: the sting at 60% volume only. DOM nodes are made once and reused.
 */
import { sfx } from '../../audio/sfx';
import type { FightCam } from './cam';

export interface UltJuice {
  slowmo(ms: number, scale: number): void;
  flash(kind: 'white' | 'gold' | 'red'): void;
  /** Records the text like a callout does (e2e reads data-said). */
  note(text: string): void;
}

const CSS = `
.pl-ult{position:absolute;left:0;right:0;top:22%;height:0;pointer-events:none;z-index:6}
.pl-ult-band{position:absolute;left:-10%;right:-10%;top:-34px;height:68px;transform:skewY(-6deg) scaleX(0);transform-origin:left center;
 background:linear-gradient(90deg,transparent,var(--ult) 18%,var(--ult) 82%,transparent);opacity:.92}
.pl-ult-text{position:absolute;left:0;right:0;top:-24px;text-align:center;font:900 30px/48px system-ui,sans-serif;color:#fff;
 text-shadow:0 2px 0 #0008,0 0 12px #0006;letter-spacing:.04em;opacity:0}
.pl-ult-text small{display:block;font:700 13px/14px system-ui,sans-serif;opacity:.85;margin-top:-6px}
.pl-ult.on .pl-ult-band{animation:pl-ult-band .9s ease-out forwards}
.pl-ult.on .pl-ult-text{animation:pl-ult-text .9s ease-out forwards}
@keyframes pl-ult-band{0%{transform:skewY(-6deg) scaleX(0)}18%{transform:skewY(-6deg) scaleX(1)}80%{opacity:.92}100%{transform:skewY(-6deg) scaleX(1);opacity:0}}
@keyframes pl-ult-text{0%{opacity:0;transform:translateX(-40px)}20%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
.pl-ult-vig{position:absolute;inset:0;pointer-events:none;z-index:5;box-shadow:inset 0 0 80px 20px #ff3040;opacity:0}
.pl-ult-vig.on{animation:pl-ult-vig .3s ease-out}
@keyframes pl-ult-vig{0%{opacity:.85}100%{opacity:0}}
.pl-ult-chip{position:absolute;left:50%;top:14%;transform:translateX(-50%);padding:4px 12px;border-radius:12px;background:#ff3040;color:#fff;
 font:800 14px system-ui,sans-serif;pointer-events:none;z-index:6;opacity:0}
.pl-ult-chip.on{animation:pl-ult-text 1.1s ease-out forwards}
@media (prefers-reduced-motion: reduce){.pl-ult.on .pl-ult-band,.pl-ult.on .pl-ult-text,.pl-ult-chip.on{animation-duration:.01s;opacity:1}}
`;

export class UltMoment {
  private root: HTMLElement | null = null;
  private band: HTMLElement | null = null;
  private text: HTMLElement | null = null;
  private vig: HTMLElement | null = null;
  private chip: HTMLElement | null = null;
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
    this.root = document.createElement('div');
    this.root.className = 'pl-ult';
    this.band = document.createElement('div');
    this.band.className = 'pl-ult-band';
    this.text = document.createElement('div');
    this.text.className = 'pl-ult-text';
    this.root.append(this.band, this.text);
    this.vig = document.createElement('div');
    this.vig.className = 'pl-ult-vig';
    this.chip = document.createElement('div');
    this.chip.className = 'pl-ult-chip';
    ui.append(this.root, this.vig, this.chip);
  }

  private restart(el: HTMLElement | null, cls: string): void {
    if (!el) return;
    el.className = cls;
    void el.offsetWidth;
    el.className = `${cls} on`;
  }

  /** The player's own ult. */
  own(heroName: string, ultName: string, color: number): void {
    this.juice.note(ultName);
    if (!this.reduced) {
      this.cam?.punch(0.05);
      this.juice.slowmo(110, 0.6);
      this.juice.flash('gold');
    }
    if (this.root && this.text) {
      this.root.style.setProperty('--ult', `#${color.toString(16).padStart(6, '0')}`);
      this.text.textContent = ultName;
      const s = document.createElement('small');
      s.textContent = heroName;
      this.text.appendChild(s);
      this.restart(this.root, 'pl-ult');
    }
    sfx.play('sting', { vol: 0.9 });
  }

  /** An enemy ult aimed at or near the player. */
  enemy(ultName: string): void {
    this.juice.note(ultName);
    this.restart(this.vig, 'pl-ult-vig');
    if (this.chip) {
      this.chip.textContent = ultName;
      this.restart(this.chip, 'pl-ult-chip');
    }
  }

  /** An ally ult: only the sting, softer. */
  ally(at: { x: number; z: number }): void {
    sfx.play('sting', { vol: 0.6, at });
  }

  dispose(): void {
    this.root?.remove();
    this.vig?.remove();
    this.chip?.remove();
  }
}
