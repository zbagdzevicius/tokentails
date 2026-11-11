/**
 * Match HUD (POC.md §3): the ability bar (portrait, level, health with shield, Q W E R, Paw Trick, Nap with
 * cooldown sweeps and key labels), the top score and clock with the next phase, a kill feed and the respawn
 * overlay. DOM, updated from the latest snapshot; writes only when a value changes.
 *
 * GAPS A4: a portrait strip (allies left of the score bar, enemies right of it) with each hero's death timer from
 * `respawnIn`. GAPS A5: a tap on an enemy portrait locks that hero on touch (`HudHost.onPortrait`). GAPS B1: held for
 * PORTRAIT_HOLD_MS it also pings "Focus hero" (`HudHost.onPortraitHold`).
 */
import type { EntitySnap, HeroId, MatchClock, MatchScore, TrickId } from '../sim/api';
import { maxCooldown, ULT_LEVEL } from '../input/abilities';
import { keyLabel, type Action } from '../input/presets';
import { HERO_COLOR_CSS, RELATION_CSS } from '../render/palette';
import { portraitUrl } from '../render/portraits';
import type { Look } from '../render/cosmetics';
import { HERO_TEXT, rankPips, rankUpSlots, trickText } from './heroText';
import { abilityRank, maxRank } from '../sim/heroes/talents';
import { icon as iconSvg } from './icons';
import { icon } from './icons';
import { chargeRing } from './overhead';
import { HERO_RULES, XP } from '../data/xp';
import { DIFFICULTY_RULES, type Difficulty } from '../data/bots';
// cards: the respawn countdown card, kill-feed faces in element rings, the ult-ready and level-up glints
import { heroElement } from './cards/el';
import type { RespawnCard } from './cards/reveal';
import type { CatTier } from '../meta/roster';
import { getSkin } from '../render/skins/skinStore';
import { cdLabel } from './cdLabel';
export { cdLabel } from './cdLabel';
import { fishProgress, toyCumulative } from './toyText';
import { FISH_GLYPH } from './progressRail';
import { TOY_COST, TOY_TIERS } from '../data/toys';
// LoL pass (lane B): the hextech HUD chrome (ability frame, XP ring, score plate, kill feed, death wash, nap bar, crest)
import './lol-hud.css';
import { applySweep, newSweep, type SweepRec } from './cdSweep';
// feel pass: the fixed-camera chrome and the phone HUD diet (after lol-hud.css, so it wins)
import './feel.css';

/** A tiny tower glyph on the "towers taken" boxes (the bare numbers next to the score read as nothing). */
const TOWER_SVG = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 15V6h2V3h2v2h2V3h2v3h2v9z" fill="currentColor"/></svg>';

const SLOT_ACTIONS: readonly Action[] = ['q', 'w', 'e', 'r', 'trick', 'nap'];

/** Crossed claws between the two kill counts (LoL's sword icon). */
const SWORDS_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 2l9.2 9.2-1.4 1.4L2 3.8V2zm18 0v1.8l-6.6 6.6-1.4-1.4L19.2 2zM9.4 14l1.4 1.4-3.3 3.3 1.2 1.2-1.4 1.4-1.9-1.9L3 21.8 2.2 21l2.4-2.4-1.9-1.9 1.4-1.4 1.2 1.2zm5.2 0l3.3 3.3 1.2-1.2 1.4 1.4-1.9 1.9 2.4 2.4-.8.8-2.4-2.4-1.9 1.9-1.4-1.4 1.2-1.2-3.3-3.3z"/></svg>';
/** Kill feed: the claw between the killer and the victim, and the face of a tower or a minion that took a hero down. */
/** Sim v21: the Kibble Cannon in a KABOOM kill-feed row (an original brass cannon on a wheel, in the row's colour). */
const CANNON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9.5l13-4.6 1.4 4-13 4.6zM17.8 4l3 8.6-1.9.7-3-8.6z"/><circle cx="8" cy="16.5" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="16.5" r="1.2" fill="currentColor"/><circle cx="21" cy="6" r="1.4" fill="#FFD34D"/></svg>';
const CLAW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3c2.5 3 3.5 7 3 12l-2 .5C6.6 10.6 6.2 6.6 5 3zm6 0c2 3.2 2.6 7.3 1.8 12.3l-2 .2C11.5 10.7 11.6 6.6 11 3zm6.5 1c1.3 3.4 1.2 7.5-.4 12.1l-1.9-.4c1.4-4.3 1.9-8 2.3-11.7zM4 18h15v3H4z"/></svg>';
const MINION_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="14" r="6" fill="currentColor"/><circle cx="6" cy="7" r="2.4" fill="currentColor"/><circle cx="12" cy="5" r="2.4" fill="currentColor"/><circle cx="18" cy="7" r="2.4" fill="currentColor"/></svg>';

/** LoL pass (lane B): the trailing damage chunk on the HUD health bar holds this long (ms), then drains. */
export const TRAIL_HOLD_MS = 350;
/** ...at this many max HPs a second. */
export const TRAIL_RATE = 1.5;

/** The trailing chunk's state: `v` the HP its far edge shows, `hp` the last HP seen, `at` the last drop (ms), `t` the last step (ms). */
export interface Trail {
  v: number;
  hp: number;
  at: number;
  t: number;
}

/**
 * LoL pass (lane B): one step of the trailing damage chunk, pure. A drop keeps the chunk's far edge where it was and
 * restarts the hold; after TRAIL_HOLD_MS it drains at TRAIL_RATE × maxHp a second down to the HP; a heal snaps it.
 */
export function trailStep(prev: Trail | null, hp: number, maxHp: number, now: number): Trail {
  if (!prev || hp >= prev.v) return { v: hp, hp, at: now - TRAIL_HOLD_MS, t: now };
  const at = hp < prev.hp ? now : prev.at;
  let v = prev.v;
  if (now - at >= TRAIL_HOLD_MS) v = Math.max(hp, v - (TRAIL_RATE * Math.max(1, maxHp) * Math.max(0, now - Math.max(prev.t, at + TRAIL_HOLD_MS))) / 1000);
  return { v, hp, at, t: now };
}

/** LoL pass (lane B): the XP ring's fill (0..1) at level `lv` with cumulative `xp` (1 at the top level). Pure. */
export function xpFrac(lv: number, xp: number): number {
  const lo = XP.toLevel[lv - 1] ?? 0;
  const hi = XP.toLevel[lv] ?? lo;
  return lv >= XP.maxLevel || hi <= lo ? 1 : Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
}

interface SlotEl {
  root: HTMLElement;
  sweep: HTMLElement;
  num: HTMLElement;
  /** Wave C (C2): the rank pips (Q W E R only). */
  rk: HTMLElement | null;
  last: string;
  /** LoL pass (lane B): the slot was cooling on the last update (its ready flash fires on the way back). */
  cooling: boolean;
  /** PERF-IOS §8 Track C: the sweep's last written step (ui/cdSweep.ts). */
  cd: SweepRec;
}

/** Lane F (F3): how long R pulses after the ultimate unlocks or ranks up (ms). */
export const ULT_PULSE_MS = 2000;

/** GAPS B1: an enemy portrait held this long (touch) pings Focus hero. */
export const PORTRAIT_HOLD_MS = 450;

export interface HudHost {
  /** A slot button was clicked or tapped (desktop users may click the bar). */
  onSlot(index: number): void;
  /** GAPS A5: an enemy portrait in the strip was tapped (touch only: the strip takes no mouse input). */
  onPortrait?(slot: number): void;
  /** GAPS B1: an enemy portrait was held PORTRAIT_HOLD_MS (touch): ping "Focus hero" on it. */
  onPortraitHold?(slot: number): void;
  /**
   * Desktop skill tooltips: the hover card for slot `slot` is up (0–4 cast slots, 5 Nap, −1 the portrait's basic
   * attack), or null once it is gone. The match previews that slot's range in the world; it never casts.
   */
  onHover?(slot: number | null): void;
}

/** Desktop skill tooltips: ui/slotTip.ts, loaded on the first desktop hover (touch never downloads it). */
type TipMod = typeof import('./slotTip');
let tipMod: TipMod | null = null;
let tipLoad: Promise<TipMod> | null = null;
function loadTips(): Promise<TipMod> {
  tipLoad ??= import('./slotTip').then((m) => (tipMod = m));
  return tipLoad;
}

/** Desktop skill tooltips: the card fades in after the pointer rests this long (a sweep across the bar shows nothing). */
export const TIP_DELAY_MS = 150;

/** A mouse on a hover-capable fine pointer (never touch, phones or a pen on a tablet). */
export function desktopHover(e: Pick<PointerEvent, 'pointerType'>): boolean {
  if (e.pointerType !== 'mouse') return false;
  if (typeof document !== 'undefined' && document.documentElement.dataset.touch === '1') return false;
  return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * One strip portrait's read (GAPS A4), pure: `until` is the tick the hero is back (kept while it is out of sight, so
 * an enemy who died in view keeps its timer), `secs` the whole seconds left while dead (null alive), `seen` whether
 * the snapshot shows it now.
 */
export function portraitTimer(e: Pick<EntitySnap, 'state' | 'respawnIn'> | undefined, tick: number, until: number): { until: number; secs: number | null; seen: boolean } {
  if (e) {
    if (e.state === 'dead') {
      const u = tick + Math.max(0, e.respawnIn ?? 0);
      return { until: u, secs: Math.max(1, Math.ceil((u - tick) / 30)), seen: true };
    }
    return { until: -1, secs: null, seen: true };
  }
  if (until > tick) return { until, secs: Math.max(1, Math.ceil((until - tick) / 30)), seen: false };
  return { until: -1, secs: null, seen: false };
}

interface StripEl {
  slot: number;
  el: HTMLElement;
  t: HTMLElement;
  until: number;
  state: string;
  /** Sim v10 (GAPS B6): the level-6 shape branch is shown on the portrait. */
  branch: boolean;
  hero: HeroId;
  label: string;
}

function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

const PHASE_NEXT: Record<MatchClock['phase'], string> = { gate: 'Gates open', play: 'Sunset', sunset: 'Sudden Death', suddenDeath: 'Final whistle', ended: '' };

/**
 * The "Sunset in 7:19" line (fun plan F1): hidden while Sunset is more than a minute away (a far-off countdown
 * read as "this match is long"); the other phases always show theirs. Pure.
 */
export function phaseLine(clock: Pick<MatchClock, 'phase' | 'nextPhaseIn'>): string {
  const next = PHASE_NEXT[clock.phase];
  if (!next || clock.nextPhaseIn <= 0) return '';
  if (clock.phase === 'play' && clock.nextPhaseIn > 60 * 30) return '';
  return `${next} in ${fmtClock(Math.ceil(clock.nextPhaseIn / 30))}`;
}

/**
 * The timer's phase line unless the objective chip already counts down to the same phase (trailer review: "Gates open
 * in 0:03" printed twice, once under the timer over the score box). Pure.
 */
export function phaseLineShown(line: string, chipTitle: string | null | undefined): string {
  if (!line || !chipTitle) return line;
  const what = (t: string): string => t.split(' in ')[0].trim().toLowerCase();
  return what(line) === what(chipTitle) ? '' : line;
}

/** A kill-feed name and whose side it is on. */
export interface FeedName {
  name: string;
  rel: 'self' | 'ally' | 'enemy' | 'neutral';
  /** cards: a hero's face in its element ring before the name (heroes only). */
  hero?: HeroId;
}

export class Hud {
  readonly root: HTMLElement;
  private slots: SlotEl[] = [];
  /** Sim v10 (GAPS B6): the own hero took its level-6 shape branch; its slot shows the new ability. */
  private branchOn = false;
  private hpFill: HTMLElement;
  private hpShield: HTMLElement;
  private hpText: HTMLElement;
  private level: HTMLElement;
  private clock: HTMLElement;
  private phase: HTMLElement;
  private kills: [HTMLElement, HTMLElement];
  private towers: [HTMLElement, HTMLElement];
  private feed: HTMLElement;
  private respawnNum: HTMLElement;
  private recapEl: HTMLElement;
  private cache = new Map<string, string>();
  private strip: StripEl[] = [];
  /** Wave C (C2): the own hero's level and talent picks (snapshot), for the rank pips, tooltips and cooldown sweeps. */
  private lv = 1;
  private choices: readonly number[] = [-1, -1, -1];
  private rankToast: HTMLElement | null = null;
  /** Desktop skill tooltips: the card, the hovered element and its slot (−1 the portrait), and what it shows now. */
  private tip: HTMLElement;
  private tipEl: HTMLElement | null = null;
  private tipI: number | null = null;
  private tipTimer: ReturnType<typeof setTimeout> | null = null;
  private tipOn = false;
  private tipBlocked = false;
  private tipLast = '';
  /** The own hero's cooldowns (ticks) and whether it is down, from the last snapshot (the card counts down live). */
  private cds: readonly number[] = [];
  private dead = false;
  /** cards: the face-down card that counts the respawn down and flips up at 0. */
  private respawnCard: RespawnCard | null = null;
  private cardDead = false;
  /** The respawn card loads (its own chunk, ui/cards/reveal.ts) on the first knockout. */
  private cardInit: (() => void) | null = null;
  /** LoL pass (lane B): the trailing damage chunk, the resource / XP bar, the nap bar, the respawn seconds. */
  private hpChunk: HTMLElement;
  private resFill: HTMLElement;
  private napEl: HTMLElement;
  private dsec: HTMLElement;
  /** Audit GFX-12: the big "Back in N" countdown in the middle of the screen while the hero is out. */
  private backIn: HTMLElement;
  private backNum: HTMLElement;
  private trail: Trail | null = null;
  private napStart = -1;
  private crestEl: HTMLElement | null = null;
  /** Ready flashes so far (e2e reads `data-cd-flash`). */
  cdFlashes = 0;
  /** `?quality=low`: the death wash is a flat overlay, not a CSS filter on the WebGL canvas. */
  lowQuality = false;
  /** Lane F (F1): the Fish chip (unspent Fish, a ring to the next Toy, a pip per Toy owned). */
  private fishEl: HTMLElement;
  private fishNum: HTMLElement;
  /** Desktop home of the Fish chip: the ability plate (`.pl-bar`), which phones hide (feel pass B3). */
  private fishHome: HTMLElement;
  /** Re-homes the chip when touch mode turns on or off (an attribute observer: no per-frame check). */
  private fishObs: MutationObserver | null = null;
  private fishShown = -1;
  private toyShown = -1;
  /** Fun pass (playtest #14): until this time (ms) the chip number says what a buy spent ("−550 → Toy"). */
  private spentUntil = 0;
  /** Lobby spec §3b: the worn card's cat name ("Ficus"): the portrait card reads "Ficus · Clem", or null. */
  private selfName: string | null = null;

  constructor(
    parent: HTMLElement,
    private readonly hero: HeroId,
    private readonly trick: TrickId,
    private readonly host: HudHost,
    look: Look | null = null,
    /** The match's difficulty (the catch-up tag's numbers, sim v10 GAPS B3). */
    private readonly difficulty: Difficulty = 'easy',
  ) {
    const t = HERO_TEXT[hero];
    // the portrait shows the equipped look (a bought skin shows in the HUD too)
    const pic = portraitUrl(hero, look);
    const tt = trickText(trick, hero);
    const root = document.createElement('div');
    root.className = 'pl-hud';
    const slotHtml = SLOT_ACTIONS.map((a, i) => {
      const ab = i < 4 ? t.abilities[i] : i === 4 ? tt : { name: 'Nap', text: 'Channel for 4 s to return to your fountain. Damage breaks it.', icon: 'nap' as const };
      const big = i === 3 ? ' ult' : i >= 4 ? ' small' : '';
      const rk = i < 4 ? `<i class="rk">${rankPips(abilityRank(1, i), maxRank(i))}</i>` : '';
      return `<button class="pl-slot${big}${i === 4 ? ' sum first' : i === 5 ? ' sum' : ''}" data-i="${i}" aria-label="${ab.name}: ${ab.text}">${icon(ab.icon)}<i class="sweep"></i><b class="num"></b>${rk}<kbd>${keyLabel(a)}</kbd></button>`;
    }).join('');
    root.innerHTML = `
      <div class="pl-top">
        <div class="pl-score lol">
          <span class="team t0"><i class="tw" title="Towers taken">${TOWER_SVG}<em class="tw0">0</em></i><b class="k0">0</b></span>
          <span class="sw" aria-hidden="true">${SWORDS_SVG}</span>
          <span class="team t1"><b class="k1">0</b><i class="tw" title="Towers taken">${TOWER_SVG}<em class="tw1">0</em></i></span>
          <span class="mid"><span class="clock">0:00</span><span class="phase"></span></span>
          <span class="obj" hidden><i class="ic" aria-hidden="true"></i><b></b></span>
        </div>
      </div>
      <div class="pl-feed"></div>
      <div class="pl-respawn"><div>Back in <b>0</b></div><small class="recap">Your team is still fighting!</small></div>
      <div class="pl-bar">
        <div class="pl-portrait${pic ? ' pic' : ''}" style="--hero:${HERO_COLOR_CSS[hero]}${pic ? `;background-image:url(${pic})` : ''}"><span>${pic ? '' : t.title.replace('Sir ', '').slice(0, 2)}</span><i class="xpring" aria-hidden="true"></i><b class="lvl">1</b><b class="dsec"></b><em class="gap"></em>${hero === 'aviete' ? '<i class="charge" title="Shy, Then Shiny"></i><b class="charge-t"></b>' : ''}</div>
        <div class="pl-bar-main">
          <div class="pl-slots">${slotHtml}</div>
          <div class="pl-hp"><i class="chunk"></i><i class="fill"></i><i class="shield"></i><span class="txt"></span></div>
          <div class="pl-res${hero === 'stilts' ? ' stride' : ''}" title="${hero === 'stilts' ? 'Stride' : 'XP to the next level'}"><i></i></div>
        </div>
        <div class="pl-fish" data-fish="0" data-toy="0" title="Fish: last hits, takedowns and objectives pay it. Your Toys buy themselves as the ring fills."><i class="ring">${FISH_GLYPH}</i><span class="col"><b class="n">0</b><span class="pips">${'<i></i>'.repeat(TOY_TIERS)}</span></span></div>

      </div>
      <div class="lol-nap" aria-hidden="true"><i class="fill"></i><span></span></div>`;
    parent.appendChild(root);
    this.root = root;
    const q = <T extends HTMLElement>(s: string): T => root.querySelector(s) as T;
    // Desktop skill tooltips: one hover card for the slots and the portrait (ui/slotTip.ts), mouse only
    const tip = document.createElement('div');
    tip.className = 'pl-slot-tip';
    tip.setAttribute('role', 'tooltip');
    root.appendChild(tip);
    this.tip = tip;
    const portraitEl = q<HTMLElement>('.pl-portrait');
    portraitEl.addEventListener('pointerenter', (e) => this.tipEnter(e, portraitEl, -1));
    portraitEl.addEventListener('pointerleave', () => this.tipLeave());
    for (const el of root.querySelectorAll<HTMLElement>('.pl-slot')) {
      this.slots.push({ root: el, sweep: el.querySelector('.sweep') as HTMLElement, num: el.querySelector('.num') as HTMLElement, rk: el.querySelector<HTMLElement>('.rk'), last: '', cooling: false, cd: newSweep() });
      el.addEventListener('pointerenter', (e) => this.tipEnter(e, el, Number(el.dataset.i)));
      el.addEventListener('pointerleave', () => this.tipLeave());
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.pointerType !== 'touch') this.host.onSlot(Number(el.dataset.i));
      });
    }
    this.fishEl = q('.pl-fish');
    this.fishNum = q('.pl-fish .n');
    this.fishHome = this.fishEl.parentElement as HTMLElement;
    this.placeFish();
    if (typeof MutationObserver !== 'undefined') {
      this.fishObs = new MutationObserver(this.placeFish);
      this.fishObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-touch'] });
    }
    this.hpFill = q('.pl-hp .fill');
    this.hpChunk = q('.pl-hp .chunk');
    this.resFill = q('.pl-res > i');
    this.napEl = q('.lol-nap');
    this.dsec = q('.pl-portrait .dsec');
    this.backIn = document.createElement('div');
    this.backIn.className = 'pl-backin';
    this.backIn.setAttribute('aria-hidden', 'true');
    this.backIn.innerHTML = '<small>Back in</small><b></b>';
    this.root.appendChild(this.backIn);
    this.backNum = this.backIn.querySelector('b') as HTMLElement;
    this.hpShield = q('.pl-hp .shield');
    this.hpText = q('.pl-hp .txt');
    this.level = q('.pl-portrait .lvl');
    this.clock = q('.clock');
    this.phase = q('.phase');
    this.kills = [q('.k0'), q('.k1')];
    this.towers = [q('.tw0'), q('.tw1')];
    this.feed = q('.pl-feed');
    this.respawnNum = q('.pl-respawn b');
    this.recapEl = q('.pl-respawn .recap');
    // cards: the worn card skin's rung gives the glints their foil (Common when none); the respawn card shows this look
    const rung = getSkin(look?.coat)?.rung ?? 'COMMON';
    root.dataset.ttTier = rung;
    this.cardInit = () => {
      this.cardInit = null;
      void import('./cards/reveal')
        .then((m) => {
          if (!root.isConnected) return;
          this.respawnCard = new m.RespawnCard(root, hero, portraitUrl(hero, look) ?? pic, rung as CatTier);
          if (this.cardDead) this.respawnCard.down(this.cardSecs);
        })
        .catch(() => undefined);
    };
  }
  private cardSecs = 0;

  /**
   * GAPS A4: the portrait strip for the other five heroes (allies and enemies, by slot). `names` are the slot labels
   * (ui/heroText.ts slotNames). Enemy portraits are buttons: a tap locks that hero on touch (A5).
   */
  /**
   * Party play (MULTIPLAYER.md §7 M1, M4): a friend's strip portrait wears its slot ring and its card art (when the
   * friend wears a card), and greys with a robot badge while a bot flies it. `null` clears it (a bot slot).
   */
  setStripSeat(slot: number, seat: { ring: string; bot: boolean; art: string | null; name: string } | null): void {
    const s = this.strip.find((x) => x.slot === slot);
    if (!s) return;
    const pic = s.el.querySelector<HTMLElement>('.pic');
    if (!seat) {
      delete s.el.dataset.ring;
      delete s.el.dataset.bot;
      return;
    }
    s.el.dataset.ring = '1';
    s.el.style.setProperty('--ring', seat.ring);
    s.el.dataset.bot = seat.bot ? '1' : '0';
    s.el.title = seat.name;
    s.el.setAttribute('aria-label', seat.name);
    if (pic && seat.art && pic.dataset.art !== seat.art) {
      pic.dataset.art = seat.art;
      pic.classList.remove('none');
      pic.textContent = '';
      pic.style.backgroundImage = `url("${seat.art.replace(/["\\]/g, '')}")`;
    }
  }

  mountStrip(picks: readonly HeroId[], mySlot: number, myTeam: number, names: readonly string[]): void {
    for (const s of this.strip) s.el.remove();
    this.strip = [];
    this.root.querySelectorAll('.pl-strip').forEach((el) => el.remove());
    const mk = (side: 'ally' | 'enemy'): HTMLElement => {
      const box = document.createElement('div');
      box.className = `pl-strip ${side}`;
      return box;
    };
    const allies = mk('ally');
    const enemies = mk('enemy');
    // sim v19: 5 a side on Hearthwood (the strip holds 4 allies and 5 enemies; ui/feel.css compacts it)
    const per = Math.max(1, picks.length >> 1);
    if (per > 3) {
      allies.dataset.size = String(per);
      enemies.dataset.size = String(per);
    }
    picks.forEach((hero, slot) => {
      if (slot === mySlot || !hero) return;
      const enemy = (slot < per ? 0 : 1) !== myTeam;
      const el: HTMLElement = document.createElement(enemy ? 'button' : 'div');
      el.className = 'pp';
      if (enemy) (el as HTMLButtonElement).type = 'button';
      el.dataset.slot = String(slot);
      const pic = portraitUrl(hero);
      el.style.setProperty('--hero', HERO_COLOR_CSS[hero]);
      el.style.setProperty('--rel', RELATION_CSS[enemy ? 'enemy' : 'ally']);
      const label = names[slot] ?? HERO_TEXT[hero].title;
      el.setAttribute('aria-label', enemy ? `Lock ${label}` : label);
      el.title = label;
      // GAPS B6: a small badge (hidden until the hero takes its level-6 shape branch) so the other side can read it
      const br = HERO_TEXT[hero].branch;
      el.innerHTML = `<i class="pic${pic ? '' : ' none'}"${pic ? ` style="background-image:url(${pic})"` : ''}>${pic ? '' : HERO_TEXT[hero].title.replace('Sir ', '').slice(0, 2)}</i><b class="t"></b>${br ? `<i class="br">${iconSvg(br.icon)}</i>` : ''}`;
      if (enemy) {
        let holdTimer: ReturnType<typeof setTimeout> | null = null;
        el.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (e.pointerType === 'touch' || document.documentElement.dataset.touch === '1') {
            this.host.onPortrait?.(slot);
            // GAPS B1: held, the tap's lock also becomes a Focus ping
            if (holdTimer) clearTimeout(holdTimer);
            holdTimer = setTimeout(() => {
              holdTimer = null;
              this.host.onPortraitHold?.(slot);
            }, PORTRAIT_HOLD_MS);
          }
        });
        const release = (): void => {
          if (holdTimer) clearTimeout(holdTimer);
          holdTimer = null;
        };
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
        el.addEventListener('pointerleave', release);
      }
      (enemy ? enemies : allies).appendChild(el);
      this.strip.push({ slot, el, t: el.querySelector('.t') as HTMLElement, until: -1, state: '', branch: false, hero, label });
    });
    this.root.appendChild(allies);
    this.root.querySelector('.pl-top')?.appendChild(enemies);
  }

  /** GAPS A4: death timers and who is out of sight; `lock` is the touch-locked enemy (A5), or null. */
  stripUpdate(byId: ReadonlyMap<number, EntitySnap>, tick: number, lock: number | null, near: ReadonlySet<number> | null = null): void {
    for (const s of this.strip) {
      // feel pass B3: on touch the enemy row is a target-lock row: only the enemies near the hero show (ui/feel.css)
      const isNear = near?.has(s.slot) === true;
      if (s.el.classList.contains('near') !== isNear) s.el.classList.toggle('near', isNear);
      const r = portraitTimer(byId.get(s.slot), tick, s.until);
      s.until = r.until;
      const state = `${r.secs !== null ? 'D' : ''}${r.seen ? '' : 'U'}${lock === s.slot ? 'L' : ''}`;
      if (state !== s.state) {
        s.state = state;
        s.el.classList.toggle('dead', r.secs !== null);
        s.el.classList.toggle('unseen', !r.seen && r.secs === null);
        s.el.classList.toggle('locked', lock === s.slot);
      }
      const txt = r.secs !== null ? String(r.secs) : '';
      if (s.t.textContent !== txt) s.t.textContent = txt;
      // GAPS B6: once a hero takes its level-6 shape branch, its portrait says so (badge and name)
      const br = byId.get(s.slot)?.branch === true;
      if (br && !s.branch) {
        s.branch = true;
        const b = HERO_TEXT[s.hero].branch;
        s.el.classList.add('branch');
        if (b) s.el.title = `${s.label} · ${b.name}`;
      }
    }
  }

  /** LoL pass (lane B): is hero `slot` out now by its strip timer (an enemy that died out of sight keeps counting)? */
  stripOut(slot: number): boolean {
    return this.strip.find((s) => s.slot === slot)?.el.classList.contains('dead') ?? false;
  }

  /** Champion browser (the in-match skill peek): the own hero's level, talent picks and whether the branch is taken. */
  codexState(): { level: number; choices: readonly number[]; branch: boolean } {
    return { level: this.lv, choices: this.choices, branch: this.branchOn };
  }

  /** GAPS B6: swap the branched slot's icon and label to the level-6 shape branch's ability. */
  private showBranch(): void {
    this.branchOn = true;
    const b = HERO_TEXT[this.hero].branch;
    const el = b ? this.slots[b.slot]?.root : undefined;
    if (!b || !el) return;
    el.setAttribute('aria-label', `${b.name}: ${b.text}`);
    el.classList.add('branch');
    el.querySelector('svg.pl-icon')?.remove();
    el.insertAdjacentHTML('afterbegin', iconSvg(b.icon));
  }

  /**
   * Feel pass B3: the top strip's objective timer (icon and seconds), or null to hide it. `key` picks the icon
   * ('pudding', 'rats', 'theirRats', 'up' when it just spawned).
   */
  private objKey = '';
  objective(o: { key: string; secs: number } | null): void {
    const el = this.root.querySelector<HTMLElement>('.pl-score .obj');
    if (!el) return;
    const k = o ? `${o.key}:${o.secs}` : '';
    if (k === this.objKey) return;
    this.objKey = k;
    el.hidden = !o;
    if (!o) return;
    el.dataset.key = o.key;
    const b = el.querySelector('b');
    if (b) b.textContent = o.key === 'up' ? 'Up!' : `${o.secs}`;
    el.setAttribute('aria-label', o.key === 'up' ? 'Objective up' : `Objective in ${o.secs} seconds`);
  }

  /** The death recap under "Back in N" ("Knocked out by Cacklejaw + a tower: wait for your minions"). */
  recap(text: string): void {
    this.set('recap', this.recapEl, text || 'Your team is still fighting!');
  }

  /** Desktop skill tooltips: the pointer rests on slot `i` (−1 the portrait); the card follows after TIP_DELAY_MS. */
  private tipEnter(e: PointerEvent, el: HTMLElement, i: number): void {
    if (!desktopHover(e)) return;
    void loadTips();
    this.tipEl = el;
    this.tipI = i;
    this.tipSchedule();
  }

  /** A worn card renames the champion: the portrait (its card and its label) carries the cat's name. */
  setSelfName(name: string | null): void {
    this.selfName = name;
    const el = this.root.querySelector<HTMLElement>('.pl-portrait');
    if (el) {
      if (name) el.setAttribute('aria-label', `${name} · ${HERO_TEXT[this.hero].title}`);
      else el.removeAttribute('aria-label');
      el.dataset.name = name ?? '';
    }
  }

  private named<T extends { name: string }>(t: T): T {
    return this.selfName ? { ...t, name: `${this.selfName} · ${t.name}` } : t;
  }

  private tipLeave(): void {
    this.tipEl = null;
    this.tipI = null;
    this.tipHide();
  }

  private tipSchedule(): void {
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => {
      this.tipTimer = null;
      if (this.tipI === null || this.tipBlocked) return;
      // the first hover can beat the chunk: show once it is in, if the pointer still rests here
      if (!tipMod) {
        void loadTips().then(() => {
          if (this.tipI !== null && !this.tipBlocked && !this.tipTimer && !this.tipOn) this.tipSchedule();
        });
        return;
      }
      this.tipOn = true;
      this.tipRender();
      this.tip.classList.add('on');
      this.host.onHover?.(this.tipI);
    }, TIP_DELAY_MS);
  }

  private tipHide(): void {
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipTimer = null;
    this.tip.classList.remove('on');
    if (this.tipOn) this.host.onHover?.(null);
    this.tipOn = false;
  }

  /**
   * Desktop skill tooltips: hide the card while the menu, the scoreboard or the talent card is up (`on`); it comes back
   * if the pointer still rests on the slot once they close.
   */
  blockTips(on: boolean): void {
    if (on === this.tipBlocked) return;
    this.tipBlocked = on;
    if (on) this.tipHide();
    else if (this.tipI !== null) this.tipSchedule();
  }

  /** The card's content for the hovered slot (written only on change: the cooldown counts down while it is up). */
  private tipRender(): void {
    const i = this.tipI;
    const m = tipMod;
    if (i === null || !m) return;
    const html = m.tipHtml(
      i < 0
        ? this.named(m.attackTip(this.hero, this.lv))
        : m.slotTip(this.hero, this.trick, i, keyLabel(SLOT_ACTIONS[i] ?? 'q'), { level: this.lv, choices: this.choices, branch: this.branchOn, cd: i < 5 ? (this.cds[i] ?? 0) : 0, dead: this.dead }),
    );
    if (html === this.tipLast && this.tip.classList.contains('on')) return;
    this.tipLast = html;
    this.tip.innerHTML = html;
    if (this.tipEl) m.placeTip(this.tip, this.tipEl);
  }

  private set(key: string, el: HTMLElement, text: string): void {
    if (this.cache.get(key) === text) return;
    this.cache.set(key, text);
    el.textContent = text;
  }

  /**
   * Round 2 ("once behind, the human falls 2 to 4 levels below the lobby and nothing shows it"): an XP bar on the
   * portrait, and when the enemy team's average level is 2+ above, a "−2 lv · +35% XP" tag (the sim's catch-up:
   * data/xp.ts XP.catchUpFreeLevels and, since sim v10, DifficultyRules.catchUp*). `enemyAvg` is the enemy heroes'
   * average level (0 = unknown).
   */
  private xpUpdate(me: EntitySnap, enemyAvg: number): void {
    const lv = me.level ?? 1;
    const xp = me.xp ?? 0;
    const f = xpFrac(lv, xp);
    // LoL pass (lane B): a conic XP ring round the portrait (and the thin bar under the health for all but Stilts)
    const pct = (f * 100).toFixed(1);
    const pic = this.level.parentElement;
    if (pic && pic.dataset.xp !== pct) {
      pic.dataset.xp = pct;
      pic.style.setProperty('--xp', f.toFixed(4));
      if (this.hero !== 'stilts') this.resFill.style.width = `${pct}%`;
    }
    const behind = enemyAvg > 0 ? enemyAvg - lv : 0;
    const rules = DIFFICULTY_RULES[this.difficulty];
    const bonus = Math.min(rules.catchUpMaxBp, Math.max(0, Math.round((behind - XP.catchUpFreeLevels) * rules.catchUpPerLevelBp))) / 100;
    const tag = behind >= 2 ? `−${Math.floor(behind)} lv${bonus > 0 ? ` · +${Math.round(bonus)}% XP` : ''}` : '';
    const gap = this.level.parentElement?.querySelector<HTMLElement>('.gap');
    if (gap && gap.textContent !== tag) {
      gap.textContent = tag;
      gap.title = tag ? 'You are behind the enemy team: you earn bonus XP until you catch up.' : '';
    }
  }

  /**
   * The Fish chip's parent. Desktop: the ability plate (a tab on its top-right corner). Phones: the match layer, on the
   * minimap's bottom-left corner (the ping paw holds the bottom-right one), because the B3 HUD diet hides the plate
   * (`display: none`) and the chip went with it. Moved once per touch-mode change, never per frame.
   */
  private readonly placeFish = (): void => {
    const touch = document.documentElement.dataset.touch === '1';
    const parent = touch ? (this.root.parentElement ?? this.root) : this.fishHome;
    if (this.fishEl.parentElement !== parent) parent.appendChild(this.fishEl);
  };

  /**
   * Lane F (F1): the Fish chip. `data-fish` is the unspent Fish, `data-toy` the tiers owned; the ring fills toward the
   * next Toy's step cost (full and gold at the last tier), one pip lights per Toy.
   */
  private fishUpdate(me: EntitySnap): void {
    const fish = Math.max(0, me.fish ?? 0);
    const toy = Math.max(0, Math.min(TOY_TIERS, me.toy ?? 0));
    if (fish === this.fishShown && toy === this.toyShown) return;
    const el = this.fishEl;
    if (toy !== this.toyShown) {
      // fun pass (playtest #14): 511 → 11 read like losing Fish; for a moment the chip says where the Fish went
      if (this.toyShown >= 0 && toy > this.toyShown) {
        let spent = 0;
        for (let t = this.toyShown; t < toy; t++) spent += TOY_COST[t] ?? 0;
        // phones: the chip is narrow (the ally portraits sit right of it), so only the spend
        this.fishNum.textContent = document.documentElement.dataset.touch === '1' ? `−${spent}` : `−${spent} → Toy`;
        el.classList.add('spent');
        this.spentUntil = performance.now() + 1500;
        setTimeout(() => {
          this.spentUntil = 0;
          el.classList.remove('spent');
          this.fishShown = -1;
        }, 1500);
      }
      el.dataset.toy = String(toy);
      el.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < toy));
      el.classList.toggle('max', toy >= TOY_TIERS);
    }
    this.fishShown = fish;
    this.toyShown = toy;
    const { frac, next } = fishProgress(fish, toy);
    el.dataset.fish = String(fish);
    el.style.setProperty('--p', frac.toFixed(3));
    if (performance.now() >= this.spentUntil) this.fishNum.textContent = String(fish);
    // phones have no hover: no title text to rebuild
    if (document.documentElement.dataset.touch !== '1') el.title = toy >= TOY_TIERS ? `${fish} Fish · all ${TOY_TIERS} Toys owned` : `${fish} / ${next} Fish to Toy ${toy + 1} (${toyCumulative(toy + 1)} in all)`;
  }

  /** Lane F (F2): the chip's ring bursts when a Toy is bought. */
  toyBurst(): void {
    const el = this.fishEl;
    el.classList.remove('burst');
    void el.offsetWidth;
    el.classList.add('burst');
    setTimeout(() => el.classList.remove('burst'), 700);
  }

  /**
   * Sim v9, Avietė: the portrait ring. A spark ring while Charged (her next damage to a hero stuns), a grey ring with
   * the seconds left during the lockout (Shiny Coat then gives speed only), nothing otherwise.
   */
  private chargeUpdate(me: EntitySnap): void {
    const el = this.root.querySelector<HTMLElement>('.pl-portrait .charge');
    if (!el) return;
    const c = chargeRing(me);
    if ((el.dataset.state ?? '') !== c.state) el.dataset.state = c.state;
    const left = c.frac.toFixed(3);
    if (el.style.getPropertyValue('--left') !== left) el.style.setProperty('--left', left);
    const t = this.root.querySelector<HTMLElement>('.pl-portrait .charge-t');
    if (t) this.set('charge', t, c.state === 'lockout' ? String(c.secs) : '');
  }

  update(me: EntitySnap | null, clock: MatchClock, score: MatchScore, myTeam: number, enemyAvg = 0, chipTitle: string | null = null): void {
    this.set('clock', this.clock, fmtClock(clock.seconds));
    this.set('phase', this.phase, phaseLineShown(phaseLine(clock), chipTitle));
    // PERF-IOS P1-5: written only on a change (the same value every frame was a style recalc every frame)
    if (this.root.dataset.phase !== clock.phase) this.root.dataset.phase = clock.phase;
    // own team on the left
    const a = myTeam === 0 ? 0 : 1;
    this.set('k0', this.kills[0], String(score.kills[a]));
    this.set('k1', this.kills[1], String(score.kills[1 - a]));
    this.set('t0', this.towers[0], String(score.towers[a]));
    this.set('t1', this.towers[1], String(score.towers[1 - a]));
    if (!me) return;
    if (me.branch && !this.branchOn) this.showBranch();
    const dead = me.state === 'dead';
    this.dead = dead;
    this.cds = me.cooldowns ?? [];
    this.root.classList.toggle('dead', dead);
    const back = Math.max(1, Math.ceil((me.respawnIn ?? 0) / 30));
    if (dead) this.set('respawn', this.respawnNum, String(back));
    // LoL pass (lane B): the death wash (the world greys, the HUD keeps its colour) and the seconds over the portrait
    this.deathWash(dead);
    this.set('dsec', this.dsec, dead ? String(back) : '');
    // GFX-12: the central countdown (the portrait seconds and the rail line were small and off to the side)
    this.backIn.classList.toggle('on', dead);
    this.set('backin', this.backNum, dead ? String(back) : '');
    // cards: face down while out, flipped up the moment the hero is back
    if (dead) {
      this.cardSecs = back;
      if (this.cardInit) this.cardInit();
      this.respawnCard?.down(back);
    } else if (this.cardDead) this.respawnCard?.reveal();
    this.cardDead = dead;
    // an open talent card hides the respawn chip (CSS) and shows the countdown as a badge on its header
    const head = this.root.parentElement?.querySelector<HTMLElement>('.pl-talents.on .head') ?? null;
    if (head) {
      const want = dead ? `Back in ${back}` : '';
      if ((head.dataset.respawn ?? '') !== want) {
        if (want) head.dataset.respawn = want;
        else delete head.dataset.respawn;
      }
    }
    const total = Math.max(me.maxHp, me.hp + me.shield) || 1;
    // LoL pass (lane B): the trailing damage chunk (a pale piece that waits, then drains to the health)
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    this.trail = trailStep(dead ? null : this.trail, Math.max(0, me.hp), me.maxHp, now);
    const hpPct = (Math.max(0, me.hp) / total) * 100;
    const chunkW = Math.max(0, ((this.trail.v - Math.max(0, me.hp)) / total) * 100);
    this.hpChunk.style.left = `${hpPct}%`;
    this.hpChunk.style.width = `${chunkW.toFixed(2)}%`;
    // Stilts's Stride (0..100) under the health; everyone else's thin XP bar is set in xpUpdate
    if (this.hero === 'stilts') this.resFill.style.width = `${Math.max(0, Math.min(100, me.resource ?? 0))}%`;
    this.napBar(me, clock.tick);
    this.hpFill.style.width = `${(Math.max(0, me.hp) / total) * 100}%`;
    this.hpShield.style.left = `${(Math.max(0, me.hp) / total) * 100}%`;
    this.hpShield.style.width = `${(Math.max(0, me.shield) / total) * 100}%`;
    this.set('hp', this.hpText, `${Math.max(0, me.hp)} / ${me.maxHp}`);
    this.root.classList.toggle('low', me.hp < me.maxHp * 0.3);
    const lv = me.level ?? 1;
    this.set('lvl', this.level, String(lv));
    if (me.talents) this.choices = me.talents;
    if (lv !== this.lv) {
      this.lv = lv;
      for (let i = 0; i < 4; i++) {
        const rk = this.slots[i]?.rk;
        if (rk) {
          rk.innerHTML = rankPips(abilityRank(lv, i), maxRank(i));
          rk.setAttribute('aria-label', `Rank ${abilityRank(lv, i)} of ${maxRank(i)}`);
        }
      }
    }
    this.xpUpdate(me, enemyAvg);
    this.fishUpdate(me);
    this.chargeUpdate(me);
    const cds = me.cooldowns;
    for (let i = 0; i < 5; i++) {
      const s = this.slots[i];
      const cd = cds?.[i] ?? 0;
      const locked = i === 3 && lv < ULT_LEVEL;
      const max = maxCooldown(this.hero, i as 0 | 1 | 2 | 3 | 4, this.trick, this.branchOn, lv, me.talents);
      const state = `${locked ? 'L' : ''}${cd > 0 ? 'C' : ''}${dead ? 'D' : ''}`;
      if (s.last !== state) {
        s.last = state;
        s.root.classList.toggle('locked', locked);
        s.root.classList.toggle('cooling', cd > 0);
        s.root.classList.toggle('ready', cd === 0 && !locked && !dead);
      }
      // LoL pass (lane B): a white-gold ring flash the moment a cooldown ends (once per cooldown)
      if (s.cooling && cd === 0 && !locked) this.cdFlash(s.root);
      s.cooling = cd > 0;
      // PERF-IOS §8 Track C: --cd is written only when the sweep moves a step (ui/cdSweep.ts), not every frame
      applySweep(s.sweep, s.cd, cd, Math.max(1, max));
      this.set(`n${i}`, s.num, cd > 0 ? cdLabel(cd) : locked ? String(ULT_LEVEL) : '');
    }
    if (this.tipOn) this.tipRender();
  }

  /** LoL pass (lane B): the 300 ms ready ring on a slot whose cooldown just ended. */
  private cdFlash(el: HTMLElement): void {
    el.classList.remove('cdflash');
    void el.offsetWidth;
    el.classList.add('cdflash');
    setTimeout(() => el.classList.remove('cdflash'), 320);
    this.cdFlashes++;
    try {
      document.documentElement.dataset.cdFlash = String(this.cdFlashes);
    } catch {
      /* node */
    }
  }

  private washOn: string | null = null;

  /**
   * LoL pass (lane B): while the player is out the world greys (a CSS filter on the game canvas, or at low quality a
   * flat overlay: filters on a WebGL canvas cost too much on a low-end phone); the HUD and the rail keep their colour.
   */
  private deathWash(dead: boolean): void {
    const want = dead ? (this.lowQuality ? 'low' : '1') : null;
    if (want === this.washOn) return;
    this.washOn = want;
    this.root.parentElement?.classList.toggle('dead', dead);
    this.root.parentElement?.classList.toggle('dead-low', want === 'low');
    try {
      if (want) document.documentElement.dataset.plDead = want;
      else delete document.documentElement.dataset.plDead;
    } catch {
      /* node */
    }
  }

  /**
   * LoL pass (lane B): the Nap channel bar over the ability bar ("Napping 3.2s", draining), from the tick the hero
   * started napping (the snapshot has no progress; HERO_RULES.napChannel is the channel). Fades out on cancel or arrival.
   */
  private napBar(me: EntitySnap, tick: number): void {
    const napping = me.state === 'napping';
    if (!napping) {
      if (this.napStart >= 0) {
        this.napStart = -1;
        this.napEl.classList.remove('on');
      }
      return;
    }
    if (this.napStart < 0) {
      this.napStart = tick;
      this.napEl.classList.add('on');
    }
    const k = Math.max(0, Math.min(1, (tick - this.napStart) / HERO_RULES.napChannel));
    const left = Math.max(0, (HERO_RULES.napChannel - (tick - this.napStart)) / 30);
    this.napEl.style.setProperty('--left', (1 - k).toFixed(3));
    this.set('nap', this.napEl.lastElementChild as HTMLElement, `Napping ${left.toFixed(1)}s`);
  }

  /**
   * LoL pass (lane B): the VICTORY / DEFEAT crest in the middle of the screen once the core has fallen (the only words
   * ever drawn there, and only because play is over), with a metallic light sweep. It stays until the results.
   */
  crest(won: boolean): void {
    if (this.crestEl) return;
    const el = document.createElement('div');
    el.className = `pl-crest ${won ? 'won' : 'lost'}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<i class="ears" aria-hidden="true"></i><b>${won ? 'VICTORY' : 'DEFEAT'}</b><i class="crack" aria-hidden="true"></i>`;
    (this.root.parentElement ?? this.root).appendChild(el);
    this.crestEl = el;
    try {
      document.documentElement.dataset.crest = won ? 'VICTORY' : 'DEFEAT';
    } catch {
      /* node */
    }
    void el.offsetWidth;
    el.classList.add('on');
  }

  /**
   * A line in the kill feed. Both names carry their side's colour (self gold, allies teal, enemies red), and the
   * player's own hero reads "You", so two Clems on opposite sides cannot be confused.
   */
  kill(killer: FeedName, victim: FeedName, good: boolean, kaboom = false): HTMLElement {
    const el = document.createElement('div');
    // LoL pass (lane B): killer face → claw → victim face (greyed, a red X), on a dark row with the team's edge
    // Sim v21: a KABOOM row has the Kibble Cannon instead of the claw
    el.className = `pl-feed-row kill ${good ? 'good' : 'bad'}${kaboom ? ' kaboom' : ''}`;
    el.style.setProperty('--edge', good ? RELATION_CSS.ally : RELATION_CSS.enemy);
    el.innerHTML = `<b></b><span class="claw">${kaboom ? CANNON_SVG : CLAW_SVG}</span><b></b>`;
    const bs = el.querySelectorAll('b');
    for (const [b, n, who] of [
      [bs[0], killer, 'killer'],
      [bs[1], victim, 'victim'],
    ] as const) {
      b.textContent = n.name;
      b.style.color = RELATION_CSS[n.rel];
      b.dataset.rel = n.rel;
      // cards: the hero's face in a ring of its card element (a tower or a minion gets its glyph instead)
      const face = document.createElement('i');
      face.className = `tt-kf ${who}`;
      face.style.setProperty('--rel', RELATION_CSS[n.rel]);
      if (n.hero) {
        const pic = portraitUrl(n.hero);
        if (pic) face.style.backgroundImage = `url(${pic})`;
        face.dataset.ttEl = heroElement(n.hero);
      } else {
        face.classList.add('glyph');
        face.innerHTML = /tower|core/i.test(n.name) ? TOWER_SVG : MINION_SVG;
      }
      face.title = n.name;
      b.before(face);
    }
    this.feed.prepend(el);
    while (this.feed.children.length > 4) this.feed.lastElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 5000);
    setTimeout(() => el.remove(), 5600);
    return el;
  }

  /** Lane F (F4): the Fish a takedown paid its killer, as a gold chip at the end of its kill-feed row. */
  feedFish(row: HTMLElement, fish: number): void {
    let chip = row.querySelector<HTMLElement>('.fish');
    if (!chip) {
      chip = document.createElement('em');
      chip.className = 'fish';
      row.appendChild(chip);
    }
    chip.innerHTML = `${FISH_GLYPH}+${fish}`;
    row.dataset.fish = String(fish);
  }

  /** A neutral line in the kill feed ("Blaze cheered your takedown"; round 1: the squad mates get a moment). */
  note(text: string): void {
    const el = document.createElement('div');
    el.className = 'pl-feed-row note';
    el.innerHTML = `<span>${icon('paw')}</span><b></b>`;
    // LoL pass (lane B): phones keep a note to 22 characters (a 22 px row)
    const touch = typeof document !== 'undefined' && document.documentElement.dataset.touch === '1';
    (el.querySelector('b') as HTMLElement).textContent = touch && text.length > 22 ? `${text.slice(0, 21).trimEnd()}…` : text;
    el.title = text;
    this.feed.prepend(el);
    while (this.feed.children.length > 4) this.feed.lastElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 4000);
    setTimeout(() => el.remove(), 4600);
  }

  /**
   * Level up (fun plan F2 item 6): the portrait pops, the health bar glows as it refills, and at the ultimate's level
   * the R slot pulses and sparkles for 3 s.
   */
  levelUp(level: number, ultLevel = ULT_LEVEL): void {
    this.rankUp(level);

    // LoL pass (lane B): the XP ring flashes gold and the level badge pops
    const pic = this.level.parentElement;
    if (pic) {
      pic.classList.remove('xpflash');
      void pic.offsetWidth;
      pic.classList.add('xpflash');
      setTimeout(() => pic.classList.remove('xpflash'), 420);
    }
    const bar = this.root.querySelector<HTMLElement>('.pl-bar');
    if (bar) {
      bar.classList.remove('lvlup');
      void bar.offsetWidth;
      bar.classList.add('lvlup');
      setTimeout(() => bar.classList.remove('lvlup'), 1200);
    }
    // Lane F (F3): R pulses for 2 s when the ultimate unlocks (level 4) or ranks up (7, 10)
    if (level === ultLevel || (level > ultLevel && abilityRank(level, 3) > abilityRank(level - 1, 3))) {
      const r = this.slots[3]?.root;
      if (r) {
        r.classList.add('ult-ready');
        setTimeout(() => r.classList.remove('ult-ready'), ULT_PULSE_MS);
      }
      try {
        document.documentElement.dataset.ultReady = '1';
        setTimeout(() => delete document.documentElement.dataset.ultReady, ULT_PULSE_MS);
      } catch {
        /* node */
      }
    }
  }

  /**
   * Wave C (C2): the upgrade toast over the ability bar ("Rank up! Volley rank 2: +15 dmg"), and the ranked slots
   * flash. Nothing at a level where no ability ranks up (talent levels, the ultimate's unlock).
   */
  rankUp(level: number): string[] {
    const ranked = rankUpSlots(this.hero, level, this.choices);
    const lines = ranked.map((r) => r.line);
    if (!lines.length) return lines;
    for (const { slot } of ranked) {
      const el = this.slots[slot]?.root;
      if (!el) continue;
      el.classList.remove('rankup');
      void el.offsetWidth;
      el.classList.add('rankup');
      setTimeout(() => el.classList.remove('rankup'), 1400);
    }
    // LoL pass (lane B): phones keep the bottom band clear: no toast over the bar. Lane F (F3): the level line on the
    // rail says it ("Level 5 — Skills rank 3"), so phones push no extra rank lines; desktop keeps the toast
    if (typeof document !== 'undefined' && document.documentElement.dataset.touch === '1') return lines;
    let t = this.rankToast;
    if (!t) {
      t = document.createElement('div');
      t.className = 'pl-rankup';
      t.setAttribute('role', 'status');
      this.root.appendChild(t);
      this.rankToast = t;
    }
    t.innerHTML = '<b>Rank up!</b>';
    for (const line of lines) {
      const sp = document.createElement('span');
      sp.textContent = line;
      t.appendChild(sp);
    }
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
    const shown = t;
    setTimeout(() => shown.classList.remove('on'), 2600);
    return lines;
  }

  /** Audit CF-12: a refused cast flashes its slot red (desktop had the deny sound only). */
  deny(index: number): void {
    const s = this.slots[index];
    if (!s) return;
    s.root.classList.remove('deny');
    void s.root.offsetWidth;
    s.root.classList.add('deny');
    setTimeout(() => s.root.classList.remove('deny'), 320);
  }

  /** Flash a slot (cast feedback). */
  pulse(index: number): void {
    const s = this.slots[index];
    if (!s) return;
    s.root.classList.remove('pulse');
    void s.root.offsetWidth;
    s.root.classList.add('pulse');
  }

  dispose(): void {
    this.deathWash(false);
    this.crestEl?.remove();
    this.crestEl = null;
    this.respawnCard?.dispose();
    this.respawnCard = null;
    this.tipLeave();
    this.fishObs?.disconnect();
    this.fishObs = null;
    this.fishEl.remove();
    this.root.remove();
  }
}
