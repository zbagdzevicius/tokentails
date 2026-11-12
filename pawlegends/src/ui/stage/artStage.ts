/**
 * The menu stage (founder, Nov 13: "we show too much of champs look rendered rather than images in in-game UI"): Home,
 * the champion select and the results show the hero as PAINTED ART on the screen's painted scene, in plain DOM. It
 * replaces the 3D lobby (render/lobby.ts: the hero model on a turntable, a pedestal and a shader backdrop drawn by the
 * game renderer behind every menu). The 3D models stay in the match and in the champion browser's skill clips.
 *
 * - L0 the screen's scene (render/lobby/lobbyBg.ts: Home's `legends` key art, the pick's spotlight stage, the
 *   results' victory or defeat scene for the hero's species), a cover-fit background;
 * - L1 the hero card: the worn skin's splash (pawlegends.app skin art) over the hero's own splash (ui/art.ts
 *   `artImgAttrs`, a load error falls back), in a gold frame, standing on the scene's ring;
 * - the purchase / Victory confetti and the PLAY dolly are short CSS animations (none infinite).
 *
 * While the stage is up the game canvas is hidden and nothing is drawn with WebGL: no GPU work on menus.
 * Cosmetic only.
 */
import './artStage.css';
import type { HeroId } from '../../sim/api';
import { HEROES } from '../../data/heroes';
import { lookKey, type Look } from '../../render/cosmetics';
import { lobbyBgFor, lobbyBgOverride, lobbyBgUrl, lobbyBgVisit, screenBg, type LobbyBg } from '../../render/lobby/lobbyBg';
import { artImgAttrs, installArtFallback, skinArtId } from '../art';
import { HERO_TEXT } from '../heroText';

export type StageMode = 'home' | 'pick' | 'results';

const CONFETTI = ['#FF3D7F', '#39A6FF', '#FFE14A', '#FF8A1E', '#F7BC3C', '#FFF3E3'];
/** The PLAY dolly (s), as the 3D one. */
export const DOLLY_MS = 400;

const reduced = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export class ArtStage {
  readonly el: HTMLDivElement;
  private readonly bg: HTMLDivElement;
  private readonly hero: HTMLElement;
  private readonly fx: HTMLDivElement;
  private mode: StageMode | null = null;
  private won = false;
  private heroId: HeroId | null = null;
  private look = '';
  private shownBg: string | null = null;
  private readonly visitBg: LobbyBg;
  private readonly forced: boolean;

  /**
   * @param root the game root (the stage goes right after `canvas`, under every screen)
   * @param canvas the game canvas: hidden while the stage is up
   * @param low Low quality (the 1280 px scenes and 360 px art only)
   */
  constructor(
    root: HTMLElement,
    private readonly canvas: HTMLElement | null,
    private readonly low: () => boolean = () => false,
  ) {
    installArtFallback();
    const el = document.createElement('div');
    el.className = 'pl-stage';
    el.setAttribute('aria-hidden', 'true');
    el.hidden = true;
    el.innerHTML = `<div class="pl-stage-bg"></div><figure class="pl-stage-hero"></figure><div class="pl-stage-fx"></div>`;
    if (canvas && canvas.parentElement === root) canvas.after(el);
    else root.prepend(el);
    this.el = el;
    this.bg = el.querySelector('.pl-stage-bg') as HTMLDivElement;
    this.hero = el.querySelector('.pl-stage-hero') as HTMLElement;
    this.fx = el.querySelector('.pl-stage-fx') as HTMLDivElement;
    const search = typeof location !== 'undefined' ? location.search : '';
    const forced = lobbyBgOverride(search);
    this.forced = forced !== null;
    this.visitBg = forced ?? lobbyBgFor(lobbyBgVisit());
    // Home's 21:9 crop on a wide phone, the 1920 px scenes on a wide screen
    addEventListener('resize', () => {
      if (this.mode) this.syncScene();
    });
  }

  /** Shows the stage for a screen (`won`: the results' Victory). The game canvas is hidden until `leave`. */
  enter(mode: StageMode, o: { won?: boolean } = {}): void {
    this.mode = mode;
    this.won = !!o.won;
    this.el.dataset.mode = mode;
    this.el.classList.remove('out');
    this.el.hidden = false;
    if (this.canvas) this.canvas.style.visibility = 'hidden';
    document.documentElement.dataset.stage = mode;
    this.syncScene();
  }

  /** A match starts: the stage goes and the canvas comes back. */
  leave(): void {
    this.mode = null;
    this.el.hidden = true;
    this.el.classList.remove('out');
    this.fx.textContent = '';
    if (this.canvas) this.canvas.style.visibility = '';
    delete document.documentElement.dataset.stage;
  }

  get active(): boolean {
    return this.mode !== null;
  }

  /** The hero in a look: its art (the skin's splash when the look has one). No-op when unchanged. */
  setHero(hero: HeroId, look: Look | null = null): void {
    const key = lookKey(look);
    if (hero === this.heroId && key === this.look && this.hero.firstChild) return;
    const changed = hero !== this.heroId;
    this.heroId = hero;
    this.look = key;
    const name = HERO_TEXT[hero]?.title ?? hero;
    const low = this.low();
    this.hero.dataset.h = hero;
    this.hero.dataset.skin = skinArtId(look) ?? '';
    this.hero.innerHTML = `<img class="pl-stage-art" alt="" draggable="false" decoding="async" ${artImgAttrs(hero, look, { low, sizes: '(max-width: 900px) 360px, 720px' })} data-testid="stage-art" data-name="${name.replace(/[&<>"']/g, '')}">`;
    if (!reduced()) {
      this.hero.classList.remove('pop');
      void this.hero.offsetWidth;
      this.hero.classList.add('pop');
    }
    if (changed && this.mode) this.syncScene();
  }

  /** Celebrate (a Victory, a purchase that arrived): CSS confetti for about `seconds`. */
  confetti(seconds = 2.5): void {
    if (reduced() || this.el.hidden) return;
    const n = this.low() ? 18 : 36;
    let html = '';
    for (let i = 0; i < n; i++) {
      const c = CONFETTI[i % CONFETTI.length];
      const x = Math.round(Math.random() * 100);
      const d = (Math.random() * Math.max(0.2, seconds - 1.4)).toFixed(2);
      const s = (1.6 + Math.random() * 1.2).toFixed(2);
      const r = Math.round(Math.random() * 720 - 360);
      html += `<i style="left:${x}%;background:${c};animation-delay:${d}s;animation-duration:${s}s;--r:${r}deg"></i>`;
    }
    this.fx.innerHTML = html;
    const t = Math.ceil((seconds + 3) * 1000);
    window.setTimeout(() => {
      if (this.fx.innerHTML === html) this.fx.textContent = '';
    }, t);
  }

  /** The PLAY dolly: the card leans in and the scene dims (~400 ms); resolves at once with reduced motion. */
  playOut(): Promise<void> {
    if (reduced() || this.el.hidden) return Promise.resolve();
    this.el.classList.add('out');
    return new Promise((res) => window.setTimeout(res, DOLLY_MS));
  }

  /** The screen's scene: Home's key art, the pick's stage, the results' scene for the hero's species. */
  private syncScene(): void {
    const side = this.heroId ? HEROES[this.heroId].side : 'cat';
    const screen = this.mode === 'home' ? 'title' : (this.mode ?? undefined);
    const bg = screenBg(screen, { won: this.won, side, forced: this.forced }) ?? this.visitBg;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const url = lobbyBgUrl(bg, {
      base: import.meta.env.BASE_URL ?? './',
      bufferWidth: (window.innerWidth || 1280) * dpr,
      low: this.low(),
      aspect: (window.innerWidth || 16) / (window.innerHeight || 9),
    });
    document.documentElement.dataset.lobbyBg = bg;
    if (url === this.shownBg) return;
    this.shownBg = url;
    let abs = url;
    try {
      abs = new URL(url, document.baseURI).href;
    } catch {
      /* keep it relative */
    }
    this.bg.style.backgroundImage = `url("${abs.replace(/["\\]/g, '')}")`;
  }
}
