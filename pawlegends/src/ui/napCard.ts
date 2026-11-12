/**
 * The nap card (founder ask 2026-11-12: "when dead this card looks off, it's related to token tails currently ... it
 * should be PawLegends IP centric"). While the player's hero is knocked out it takes "a quick, grumpy nap" at the
 * fountain (LORE.md); this card says so in the Hearth Storybook look: a painted fountain-and-cushion backdrop
 * (public/assets/nap/, Gemini, no text), the player's champion splash in a gold ring, the respawn countdown, who
 * knocked them out (their champion medallion, or a tower or minion glyph) and one short Paw Legends tip or lore line
 * that changes each knockout and every few seconds of a long nap.
 *
 * It replaces the face-down Token Tails card (ui/cards/reveal.ts RespawnCard: the Token Tails card back, element
 * frame and rarity foil) and the plain "Back in N" counter. DOM only; nothing loads until the first knockout (the art
 * is a CSS background set on show). Low quality takes the small backdrop. Reduced motion: no entrance, no line fade.
 * Placement (ui.css `.pl-napcard`): top centre, clear of the minimap, the ability bar, the Fish chip and the touch
 * buttons.
 */
import type { HeroId } from '../sim/api';
import { HERO_TEXT } from './heroText';
import { LORE, WORLD } from '../data/lore';
import './napCard.css';

const BASE: string = (() => {
  try {
    return String((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './');
  } catch {
    return './';
  }
})();
const asset = (p: string): string => `${BASE.endsWith('/') ? BASE : `${BASE}/`}assets/${p}`;

/** The backdrop (960 px, about 24 KB) and the Low quality one (480 px, about 6 KB). */
export const NAP_ART = Object.freeze({ hi: 'nap/fountain-960.webp', lo: 'nap/fountain-lo.webp' });
/** A champion's splash (public/assets/splash, the same files the Champions store shows). */
export const splashOf = (hero: HeroId): string => asset(`splash/${hero}-360.webp`);
/** How long one tip or lore line stays (ms) on a long nap. */
export const NAP_LINE_MS = 6000;

/** Who knocked the player out: a hero (its medallion), a tower or core, or minions and the rest. */
export interface NapKiller {
  kind: 'hero' | 'tower' | 'minion' | 'other';
  hero?: HeroId | null;
}

const isCat = (hero: HeroId): boolean => LORE[hero].home === 'Purrhaven Isle';

/**
 * The lines the card rotates through for this champion: play tips that fit a nap (what to do when back), then the
 * champion's own words and the Crossing's lore. Every line is Paw Legends' own (data/lore.ts, GDD words).
 */
export function napLines(hero: HeroId): string[] {
  const cat = isCat(hero);
  const minions = cat ? 'Kitten Cadets' : 'Pup Troopers';
  const towers = cat ? 'Scratching Posts' : 'Kennels';
  const l = LORE[hero];
  const place = (name: string): string | null => {
    const p = WORLD.places.find((x) => x.name === name);
    return p ? `${p.name}: ${p.text}` : null;
  };
  const lines = [
    `Back on the Crossing, walk in behind your ${minions}: towers hit whoever is in front.`,
    'Fish buys your next Toy the moment there is enough. Last hits pay the most.',
    'Catnip Bushes hide anyone inside. Peek with an ally before you walk past one.',
    `Your ${towers} hit hard. Fight next to them and let the other side come to you.`,
    `"${l.quote}" (${HERO_TEXT[hero].title})`,
    `${HERO_TEXT[hero].title}: ${l.howTheyFight}`,
    place('Pudding'),
    place('Rat camps'),
    'Nobody is ever really hurt on the Crossing. A knocked-out hero just takes a quick, grumpy nap.',
  ];
  return lines.filter((s): s is string => !!s);
}

/** Each knockout starts on the next line, so a player who naps often still reads something new. */
let napCount = 0;

const reduced = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const TOWER_GLYPH =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2h2v2h1.5V2h3v2H11V2h2v4l-1.5 1.5V13h1v2h-9v-2h1V7.5L3 6z"/></svg>';
const PAW_GLYPH =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><ellipse cx="12" cy="15.5" rx="5.2" ry="4.3"/><ellipse cx="5.6" cy="10" rx="2.1" ry="2.6"/><ellipse cx="9.6" cy="6.4" rx="2.1" ry="2.6"/><ellipse cx="14.4" cy="6.4" rx="2.1" ry="2.6"/><ellipse cx="18.4" cy="10" rx="2.1" ry="2.6"/></g></svg>';

export class NapCard {
  readonly el: HTMLElement;
  private secsEl: HTMLElement;
  private recapEl: HTMLElement;
  private medalEl: HTMLElement;
  private lineEl: HTMLElement;
  private artEl: HTMLElement;
  private lines: string[];
  private lineI = 0;
  private lineAt = 0;
  private on = false;
  private secs = '';
  private art = '';
  private readonly calm = reduced();

  constructor(parent: HTMLElement, private readonly hero: HeroId) {
    const el = document.createElement('div');
    el.className = `pl-napcard${this.calm ? ' calm' : ''}`;
    el.dataset.side = isCat(hero) ? 'cat' : 'dog';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'off');
    el.innerHTML = `<i class="nc-art" aria-hidden="true"></i>
      <span class="nc-hero" aria-hidden="true"><img alt="" decoding="async" draggable="false"></span>
      <span class="nc-body">
        <small class="nc-kicker">Napping at the fountain</small>
        <span class="nc-back"><span>Back in</span><b class="nc-secs"></b></span>
        <span class="nc-by"><i class="nc-medal" aria-hidden="true"></i><span class="nc-recap">Your team is still fighting!</span></span>
      </span>
      <span class="nc-line"></span>`;
    parent.appendChild(el);
    this.el = el;
    const q = (s: string): HTMLElement => el.querySelector(s) as HTMLElement;
    this.secsEl = q('.nc-secs');
    this.recapEl = q('.nc-recap');
    this.medalEl = q('.nc-medal');
    this.lineEl = q('.nc-line');
    this.artEl = q('.nc-art');
    this.lines = napLines(hero);
  }

  /** Out: show the card with `secs` left (whole seconds). No DOM write when nothing changed. */
  show(secs: number, low = false, now = Date.now()): void {
    const s = String(Math.max(1, Math.ceil(secs)));
    if (!this.on) {
      this.on = true;
      // the art loads on the first knockout only; Low quality takes the light file
      const art = `url("${asset(low ? NAP_ART.lo : NAP_ART.hi)}")`;
      if (art !== this.art) {
        this.art = art;
        this.artEl.style.backgroundImage = art;
      }
      const img = this.el.querySelector('img') as HTMLImageElement;
      if (!img.getAttribute('src')) img.setAttribute('src', splashOf(this.hero));
      this.lineI = napCount++ % this.lines.length;
      this.lineAt = now;
      this.lineEl.textContent = this.lines[this.lineI] ?? '';
      this.el.classList.add('on');
      this.el.setAttribute('aria-label', `Napping at the fountain. Back in ${s}.`);
    } else if (now - this.lineAt >= NAP_LINE_MS && this.lines.length > 1) {
      this.lineAt = now;
      this.lineI = (this.lineI + 1) % this.lines.length;
      this.lineEl.textContent = this.lines[this.lineI] ?? '';
    }
    if (s !== this.secs) {
      this.secs = s;
      this.secsEl.textContent = s;
    }
  }

  /** Who knocked the player out ("Knocked out by Chomp the Domino") and their medallion. */
  knockedOut(text: string, killer: NapKiller | null = null): void {
    this.recapEl.textContent = text || 'Your team is still fighting!';
    const m = this.medalEl;
    m.className = 'nc-medal';
    m.innerHTML = '';
    m.style.backgroundImage = '';
    if (killer?.kind === 'hero' && killer.hero && HERO_TEXT[killer.hero]) {
      m.classList.add('hero');
      m.style.backgroundImage = `url("${splashOf(killer.hero)}")`;
      m.dataset.hero = killer.hero;
    } else {
      delete m.dataset.hero;
      m.classList.add(killer?.kind === 'tower' ? 'tower' : 'paw');
      m.innerHTML = killer?.kind === 'tower' ? TOWER_GLYPH : PAW_GLYPH;
    }
  }

  /** Back in the fight (or the match ended). */
  hide(): void {
    if (!this.on) return;
    this.on = false;
    this.secs = '';
    this.el.classList.remove('on');
  }

  get shown(): boolean {
    return this.on;
  }

  dispose(): void {
    this.el.remove();
  }
}

/** Tests only: the line rotation starts from the first line. */
export function _resetNapLines(): void {
  napCount = 0;
}
