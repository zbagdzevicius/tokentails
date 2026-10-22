/**
 * Race HUD (GDD 11 UI; iteration 2 redesign by the audio-ui lane). DOM, no framework, diffed writes only.
 *
 * Layout (portrait first; landscape and safe areas in hud.css):
 *  - top left: the place badge (gold / silver / bronze sticker that flips when the place changes, with a ▲/▼ chip);
 *    in battle the player's balloons and the cats still in it sit under it
 *  - top centre: the item slot (roulette that spins and slows, the item name when it lands, charges)
 *  - top right (under ☰): lap counter (the battle timer in battle), Grand Prix race index, race time, time-trial
 *    split chip, the mode tag, the mini-map (rival ring, incoming items, your heading) and the fish-coin meter
 *  - bottom centre: the drift meter (tier pips with shapes ● ◆ ★ in the colour-blind-safe tier colours) and speed
 *  - the one centre message slot (`say`, B33), the tap prompt, WRONG WAY, captions and incoming-item edge arrows
 *
 * Iteration 2 contract (frozen API): `say(text, { prio, ms, sub, tone, big, id })`, `unsay`, `HudModel` via `setModel`
 * (modes and progression fill it through `shell.hudExtras`). Additions owned by audio-ui: `setArrows`, `caption`,
 * `setMinimapExtras`. Every visible string goes through `t()`.
 */
import type { ItemId, KartState, RaceEvent, RaceMode, RaceState } from '../../types';
import type { BuiltTrack } from '../track/build';
import { speedOf } from '../sim/kart';
import { DRIFT, PHYS, ticks } from '../../tuning';
import { t } from '../../ui/i18n';
import { a11y, driftTierColors } from '../../ui/a11y';
import { drawPieceIcons } from './stunt-hud';
import { JuiceHud } from './juice-hud';

export const ITEM_ICON: Record<ItemId, string> = {
  hairball: '🟤',
  yarn: '🧶',
  cucumber: '🥒',
  catnip: '🌿',
  box: '📦',
  bell: '🔔',
  zoomies: '⚡',
  laser: '🔴',
};
/** Item names (English keys for `t()`). */
export const ITEM_NAME: Record<ItemId, string> = {
  hairball: 'Hairball',
  yarn: 'Yarn',
  cucumber: 'Cucumber',
  catnip: 'Catnip',
  box: 'Box',
  bell: 'Bell',
  zoomies: 'Zoomies',
  laser: 'Laser Dot',
};
const ROULETTE = Object.values(ITEM_ICON);
/** The roulette's current icon (the HUD slot and the touch item button show the same one, playtest round 2 B6). */
export function rouletteIcon(tick: number, rouletteTicks: number): string {
  return ROULETTE[Math.floor(tick / (2 + (72 - rouletteTicks) / 12)) % ROULETTE.length];
}
/** Drift tier shapes: the colour-blind shape cue next to every tier colour. */
export const TIER_SHAPE = ['●', '◆', '★'] as const;

/** English ordinal suffix key for `t()` ('st', 'nd', 'rd', 'th'). */
export function ordinalSuffix(n: number): string {
  return n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
}

export function ordinal(n: number): string {
  return `${n}<small>${t(`ordinal.${ordinalSuffix(n)}`)}</small>`;
}

export function ordinalText(n: number): string {
  return `${n}${t(`ordinal.${ordinalSuffix(n)}`)}`;
}

export function fmtTime(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return '–:––.––';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

/** Signed split delta: "−0.42" (ahead, green) or "+0.31" (behind, red). */
export function fmtDelta(sec: number): string {
  const s = Math.abs(sec).toFixed(2);
  return sec < 0 ? `−${s}` : `+${s}`;
}

/** Battle clock "2:41" (whole seconds, rounded up so 0:00 means time is up). */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type SayTone = '' | 'blue' | 'orange' | 'pink' | 'gold' | 'cyan' | 'red' | 'green';

export interface SayOpts {
  /** 0 hint, 1 callout, 2 race banner, 3 countdown / finish. A higher one replaces, a lower one waits or drops. */
  prio?: 0 | 1 | 2 | 3;
  /** how long it stays up, ms (default 1400; hints 3000) */
  ms?: number;
  sub?: string;
  tone?: SayTone;
  /** the countdown's big numerals */
  big?: boolean;
  /** an id so the caller can take its own message down (`unsay`) */
  id?: string;
  /** iteration 4 (F13): a strip under a big numeral (the countdown's Pounce hint), so the digit stands alone */
  strip?: string;
}

/** Fields the HUD shows beyond v1 (iteration 2). */
export interface HudModel {
  mode: RaceMode;
  /** fish coins held (shown when the track has coins) */
  coins: number;
  showCoins: boolean;
  rival?: { kart: number; name: string };
  balloons?: number[];
  /** battle / time limit, seconds */
  timeLeft?: number;
  /** battle: points per kart */
  battleScore?: number[];
  /** time trial: split deltas in seconds (negative = ahead) */
  splits?: number[];
  /** Grand Prix: race n of m */
  gpRace?: { n: number; of: number };
  /** incoming item markers (kart index of the target, item id) */
  incoming: Array<{ item: ItemId; eta: number }>;
  /** a tag under the lap counter (e.g. "Daily Cup #3", B36) */
  tag?: string;
}

export function emptyHudModel(): HudModel {
  return { mode: 'race', coins: 0, showCoins: false, incoming: [] };
}

/** An edge arrow for an incoming item: angle 0 = ahead (top), π = behind (bottom). */
export interface HudArrow {
  angle: number;
  item: ItemId;
  eta: number;
}

interface Msg {
  text: string;
  o: SayOpts;
  until: number;
  at: number;
}

const WRONG_BANNER = ticks(PHYS.wrongWay);
/** The kart view's three trick poses, in the order it strikes them (core/render/kart-view.ts). */
export const TRICK_POSES = ['Barrel roll', 'Superman', 'Spin'] as const;
const TIER_TONES: readonly SayTone[] = ['blue', 'orange', 'pink'];
const MAP = 192;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

export class Hud {
  readonly root: HTMLDivElement;
  private pos: HTMLDivElement;
  private posN: HTMLSpanElement;
  private posOf: HTMLElement;
  private posDelta: HTMLElement;
  private balloons: HTMLDivElement;
  private rival: HTMLDivElement;
  private item: HTMLDivElement;
  private itemIcon: HTMLSpanElement;
  private itemName: HTMLDivElement;
  private lap: HTMLDivElement;
  private gp: HTMLDivElement;
  private time: HTMLDivElement;
  private split: HTMLDivElement;
  private tag: HTMLDivElement;
  private coins: HTMLDivElement;
  private coinN: HTMLElement;
  private coinBar: HTMLElement;
  private speed: HTMLDivElement;
  private drift: HTMLDivElement;
  private driftFill: HTMLElement;
  private driftPips: HTMLElement[];
  private slot: HTMLDivElement;
  private wrong: HTMLDivElement;
  private tap: HTMLDivElement;
  private cap: HTMLDivElement;
  private arrowsBox: HTMLDivElement;
  private arrowEls: HTMLDivElement[] = [];
  private map: HTMLCanvasElement;
  private mapBg: HTMLCanvasElement | null = null;
  private lastPlace = 0;
  private lastHtml = { pos: '', of: '', item: '', itemName: '', lap: '', gp: '', time: '', speed: '', tag: '', coins: '', balloons: '', split: '', drift: '', rival: '' };
  private bounds = { minX: 0, minZ: 0, scale: 1 };
  private cur: Msg | null = null;
  private queue: Msg[] = [];
  private slotTimer: ReturnType<typeof setTimeout> | null = null;
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  private model: HudModel = emptyHudModel();
  /** the FTUE hint that should be up (it rides under the countdown numbers, and comes back when the slot frees) */
  private hintWanted: string | null = null;
  /** B58: no per-frame allocation for the map */
  private readonly xy: [number, number] = [0, 0];
  private rolling = false;
  private itemShownAt = 0;
  private lastCoins = -1;
  private splitCount = 0;
  private splitUntil = 0;
  private incomingXZ: Array<{ x: number; z: number }> = [];
  private tierCols: string[] = [];
  /** iteration 4 (juice lane): gap chips, edge glow, photo stamp, slipstream ring, ON FIRE, fastest lap */
  readonly fx: JuiceHud;
  /** the player's tricks this race (the kart view poses them in turn: barrel roll, superman, spin) */
  private tricks = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'fm-hud';
    this.root.innerHTML = `
      <div class="fm-tl">
        <div class="fm-pos" data-place="0"><span class="fm-pos-n fm-outline"></span><small class="fm-pos-of fm-outline"></small><i class="fm-pos-delta" aria-hidden="true"></i></div>
        <div class="fm-rival fm-chip" aria-hidden="true"></div>
        <div class="fm-balloons" aria-hidden="true"></div>
        <div class="fm-coins"><b aria-hidden="true">🐟</b><span class="n"></span><i class="bar" aria-hidden="true"><i></i></i></div>
      </div>
      <div class="fm-item fm-sticker empty" aria-hidden="true"><span class="fm-item-i"></span></div>
      <div class="fm-item-name fm-outline" aria-hidden="true"></div>
      <div class="fm-right">
        <div class="fm-lap fm-sticker"></div>
        <div class="fm-rrow"><div class="fm-gp fm-chip"></div><div class="fm-time"></div></div>
        <div class="fm-split fm-chip"></div>
        <div class="fm-tag fm-outline"></div>
        <canvas class="fm-map" width="${MAP}" height="${MAP}" aria-hidden="true"></canvas>
      </div>
      <div class="fm-bottom">
        <div class="fm-drift" aria-hidden="true"><i class="fill"></i><span class="pip"></span><span class="pip"></span><span class="pip"></span></div>
        <div class="fm-speed fm-outline"></div>
      </div>
      <div class="fm-arrows" aria-hidden="true"></div>
      <div class="fm-slot fm-outline" role="status" aria-live="polite"></div>
      <div class="fm-caption" role="status" aria-live="polite"></div>
      <div class="fm-tap"></div>
      <div class="fm-wrong fm-outline"></div>`;
    parent.appendChild(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.pos = q('.fm-pos');
    this.posN = q('.fm-pos-n');
    this.posOf = q('.fm-pos-of');
    this.posDelta = q('.fm-pos-delta');
    this.balloons = q('.fm-balloons');
    this.rival = q('.fm-rival');
    this.item = q('.fm-item');
    this.itemIcon = q('.fm-item-i');
    this.itemName = q('.fm-item-name');
    this.lap = q('.fm-lap');
    this.gp = q('.fm-gp');
    this.time = q('.fm-time');
    this.split = q('.fm-split');
    this.tag = q('.fm-tag');
    this.coins = q('.fm-coins');
    this.coinN = q('.fm-coins .n');
    this.coinBar = q('.fm-coins .bar > i');
    this.speed = q('.fm-speed');
    this.drift = q('.fm-drift');
    this.driftFill = q('.fm-drift .fill');
    this.driftPips = [...this.root.querySelectorAll<HTMLElement>('.fm-drift .pip')];
    this.slot = q('.fm-slot');
    this.wrong = q('.fm-wrong');
    this.tap = q('.fm-tap');
    this.cap = q('.fm-caption');
    this.arrowsBox = q('.fm-arrows');
    this.map = q('.fm-map');
    this.wrong.textContent = `⟲ ${t('WRONG WAY')}`;
    this.fx = new JuiceHud(this.root, q('.fm-tl'), q('.fm-bottom'));
    this.applyTierColours();
  }

  /** Re-read the colour-blind tier colours (the audio-ui install calls this when the setting changes). */
  applyTierColours(): void {
    this.tierCols = driftTierColors().map(hex);
    this.driftPips.forEach((p, i) => {
      p.textContent = TIER_SHAPE[i];
      p.style.setProperty('--c', this.tierCols[i]);
    });
    this.lastHtml.drift = '';
  }

  /** Touch layout: the top item slot is display-only, the real button is bottom right (B45). */
  setTouch(on: boolean): void {
    if (this.root.classList.contains('touch') !== on) this.root.classList.toggle('touch', on);
  }

  /** Pre-render the track outline for the mini-map. */
  setTrack(tr: BuiltTrack, accent: string): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < tr.n; i++) {
      minX = Math.min(minX, tr.px[i]);
      maxX = Math.max(maxX, tr.px[i]);
      minZ = Math.min(minZ, tr.pz[i]);
      maxZ = Math.max(maxZ, tr.pz[i]);
    }
    const pad = 16;
    const scale = (MAP - pad * 2) / Math.max(1, maxX - minX, maxZ - minZ);
    this.bounds = { minX: minX - (MAP / scale - (maxX - minX)) / 2, minZ: minZ - (MAP / scale - (maxZ - minZ)) / 2, scale };
    const bg = document.createElement('canvas');
    bg.width = bg.height = MAP;
    const g = bg.getContext('2d');
    if (g) {
      g.lineCap = g.lineJoin = 'round';
      const path = () => {
        g.beginPath();
        for (let i = 0; i <= tr.n; i += 4) {
          const [x, y] = this.mapXY(tr.px[i % tr.n], tr.pz[i % tr.n]);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
      };
      // a soft plate behind the loop so it reads on any sky
      g.fillStyle = 'rgba(26, 18, 56, 0.28)';
      g.beginPath();
      g.arc(MAP / 2, MAP / 2, MAP / 2 - 2, 0, Math.PI * 2);
      g.fill();
      path();
      g.strokeStyle = '#2a1a22';
      g.lineWidth = 18;
      g.stroke();
      path();
      g.strokeStyle = '#fff3dc';
      g.lineWidth = 10;
      g.stroke();
      // start line: a chequered tick across the road
      const [sx, sy] = this.mapXY(tr.px[0], tr.pz[0]);
      g.fillStyle = '#2a1a22';
      g.fillRect(sx - 8, sy - 8, 16, 16);
      g.fillStyle = accent;
      g.fillRect(sx - 5, sy - 5, 10, 10);
      // iteration 3: set-piece icons (loop ring, wall arc, gap, tunnel)
      drawPieceIcons(g, tr, (x, z) => this.mapXY(x, z));
    }
    this.mapBg = bg;
    this.clearSay();
    this.caption(null);
    this.setArrows([]);
    this.model = { ...emptyHudModel(), showCoins: tr.coins.length > 0 };
    this.lastPlace = 0;
    this.lastCoins = -1;
    this.splitCount = 0;
    this.splitUntil = 0;
    this.split.classList.remove('on');
    this.pos.classList.remove('flip', 'lost', 'gained');
    this.tricks = 0;
    this.fx.reset();
    for (const k of Object.keys(this.lastHtml)) (this.lastHtml as Record<string, string>)[k] = '\u0000';
  }

  private mapXY(x: number, z: number): [number, number] {
    // north up: +z is up on the map; mirror x so the map matches the view's handedness
    this.xy[0] = MAP - (x - this.bounds.minX) * this.bounds.scale;
    this.xy[1] = MAP - (z - this.bounds.minZ) * this.bounds.scale;
    return this.xy;
  }

  /** Merge fields into the HUD model (modes, progression and the shell call this through `shell.hudExtras`). */
  setModel(m: Partial<HudModel>): void {
    this.model = { ...this.model, ...m };
  }

  get hudModel(): Readonly<HudModel> {
    return this.model;
  }

  /** Edge arrows for incoming items (the audio-ui HUD feed, every frame). */
  setArrows(list: readonly HudArrow[]): void {
    while (this.arrowEls.length < list.length) {
      const el = document.createElement('div');
      el.className = 'fm-arrow';
      el.innerHTML = '<b></b><span></span>';
      this.arrowsBox.appendChild(el);
      this.arrowEls.push(el);
    }
    for (let i = 0; i < this.arrowEls.length; i++) {
      const el = this.arrowEls[i];
      const a = list[i];
      if (!a) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      // on an ellipse around the screen centre; the arrow points at the item
      const sx = 50 + Math.sin(a.angle) * 40;
      const sy = 50 - Math.cos(a.angle) * 38;
      el.style.left = `${sx.toFixed(1)}%`;
      el.style.top = `${sy.toFixed(1)}%`;
      (el.firstChild as HTMLElement).style.transform = `rotate(${((a.angle * 180) / Math.PI).toFixed(0)}deg)`;
      const icon = ITEM_ICON[a.item];
      const span = el.lastChild as HTMLElement;
      if (span.textContent !== icon) span.textContent = icon;
      el.classList.toggle('urgent', a.eta < 0.9);
    }
  }

  /** Incoming items for the mini-map (world positions). */
  setMinimapExtras(incoming: ReadonlyArray<{ x: number; z: number }>): void {
    this.incomingXZ = incoming as Array<{ x: number; z: number }>;
  }

  /** A caption line (announcer, captions setting on); null clears it. */
  caption(text: string | null, ms = 1800): void {
    if (this.capTimer) clearTimeout(this.capTimer);
    this.capTimer = null;
    if (!text) {
      this.cap.classList.remove('on');
      return;
    }
    this.cap.textContent = text;
    this.cap.classList.remove('on');
    void this.cap.offsetWidth;
    this.cap.classList.add('on');
    this.capTimer = setTimeout(() => this.cap.classList.remove('on'), ms);
  }

  update(st: RaceState, me: number, topSpeed: number, goTick: number, colors: string[]): void {
    const k = st.karts[me];
    const m = this.model;
    const battle = m.mode === 'battle';
    const pre = st.tick < goTick;
    if (pre !== this.root.classList.contains('pre')) this.root.classList.toggle('pre', pre);
    // place badge
    const place = k.place;
    const posHtml = ordinal(place);
    if (posHtml !== this.lastHtml.pos) {
      this.posN.innerHTML = posHtml;
      this.lastHtml.pos = posHtml;
      this.pos.dataset.place = String(Math.min(4, place));
      if (this.lastPlace && place !== this.lastPlace) {
        // iteration 4 (F4): the overtake punch, "+1 ▲" and a gold pop on a gain, "−1 ▼" and a red shake on a loss
        const up = place < this.lastPlace;
        const n = Math.abs(place - this.lastPlace);
        this.posDelta.textContent = up ? `+${n} ▲` : `−${n} ▼`;
        this.posDelta.className = `fm-pos-delta ${up ? 'up' : 'down'}`;
        this.pos.classList.remove('flip', 'lost', 'gained');
        void this.pos.offsetWidth;
        this.pos.classList.add('flip', up ? 'gained' : 'lost');
      }
      this.lastPlace = place;
    }
    const ofHtml = `/${st.karts.length}`;
    if (ofHtml !== this.lastHtml.of) {
      this.posOf.textContent = this.lastHtml.of = ofHtml;
      // a lone kart (Time Trial, a 1v1 ghost duel) has no place to show: "1st/1" reads as noise
      this.pos.style.display = st.karts.length <= 1 ? 'none' : '';
    }

    // item slot: the roulette spins and slows, then the item pops in with its name
    let itemHtml = '';
    const rolling = !!k.item && k.rouletteTicks > 0;
    if (rolling) itemHtml = rouletteIcon(st.tick, k.rouletteTicks);
    else if (k.item) itemHtml = ITEM_ICON[k.item] + (k.itemCount > 1 ? `<span class="n">×${k.itemCount}</span>` : '');
    if (itemHtml !== this.lastHtml.item) {
      this.itemIcon.innerHTML = itemHtml;
      this.item.classList.toggle('empty', !k.item);
      this.lastHtml.item = itemHtml;
    }
    if (rolling !== this.rolling) {
      this.rolling = rolling;
      this.item.classList.toggle('rolling', rolling);
      if (!rolling && k.item) {
        this.item.classList.remove('ready');
        void this.item.offsetWidth;
        this.item.classList.add('ready');
        this.itemShownAt = now();
      }
    }
    const name = k.item && !rolling && now() - this.itemShownAt < 1600 ? t(ITEM_NAME[k.item]) : '';
    if (name !== this.lastHtml.itemName) {
      this.itemName.textContent = this.lastHtml.itemName = name;
      this.itemName.classList.toggle('on', !!name);
    }

    // lap (or the battle clock) + Grand Prix index + time
    let lapHtml: string;
    if (battle) {
      const left = m.timeLeft ?? 0;
      lapHtml = `⏱ ${fmtClock(left)}`;
      this.lap.classList.toggle('hurry', left <= 10);
    } else {
      const lapN = Math.max(1, Math.min(st.laps, k.lap));
      lapHtml = t('LAP {n}/{m}', { n: lapN, m: st.laps });
      this.lap.classList.toggle('final', lapN === st.laps && st.laps > 1 && st.tick > goTick);
    }
    if (lapHtml !== this.lastHtml.lap) this.lap.textContent = this.lastHtml.lap = lapHtml;
    const gpHtml = m.gpRace ? t('RACE {n}/{m}', { n: m.gpRace.n, m: m.gpRace.of }) : '';
    if (gpHtml !== this.lastHtml.gp) {
      this.gp.textContent = this.lastHtml.gp = gpHtml;
      this.gp.classList.toggle('on', !!gpHtml);
    }
    const secs = k.finished ? k.finishTime / 60 : Math.max(0, st.tick - goTick) / 60;
    const tHtml = battle ? '' : fmtTime(secs);
    if (tHtml !== this.lastHtml.time) {
      this.time.textContent = this.lastHtml.time = tHtml;
      this.time.classList.toggle('on', !!tHtml);
    }
    // time-trial split: the newest delta shows for 3 s (green ahead, red behind)
    const splits = m.splits;
    if (splits && splits.length !== this.splitCount) {
      this.splitCount = splits.length;
      if (splits.length) {
        const d = splits[splits.length - 1];
        this.split.textContent = fmtDelta(d);
        this.split.className = `fm-split fm-chip on ${d < 0 ? 'ahead' : 'behind'}`;
        this.splitUntil = now() + 3000;
      }
    }
    if (this.splitUntil && now() > this.splitUntil) {
      this.splitUntil = 0;
      this.split.classList.remove('on');
    }
    const tagHtml = m.tag ?? '';
    if (tagHtml !== this.lastHtml.tag) {
      this.tag.textContent = this.lastHtml.tag = tagHtml;
      this.tag.classList.toggle('on', !!tagHtml);
    }

    // fish coins: count + a 10-step meter, a pulse on every pickup
    const coinHtml = m.showCoins ? String(k.coins) : '';
    if (coinHtml !== this.lastHtml.coins) {
      this.lastHtml.coins = coinHtml;
      this.coins.classList.toggle('on', !!coinHtml);
      this.coinN.textContent = k.coins >= 10 ? t('MAX') : coinHtml;
      this.coinBar.style.width = `${Math.min(10, k.coins) * 10}%`;
      this.coins.classList.toggle('max', k.coins >= 10);
      if (this.lastCoins >= 0 && k.coins > this.lastCoins) {
        this.coins.classList.remove('pulse');
        void this.coins.offsetWidth;
        this.coins.classList.add('pulse');
      }
      this.lastCoins = k.coins;
    }

    // the rival (progression / Grand Prix): name and where they are now
    let rHtml = '';
    const rv = m.rival;
    if (rv && st.karts[rv.kart] && rv.kart !== me) {
      const rk = st.karts[rv.kart];
      // ⚔️ with the emoji selector: the bare ⚔ drew as a thin "×" on some phones and read as a close button
      rHtml = `⚔️ ${t('{name} · {p}', { name: rv.name, p: ordinalText(rk.place) })}`;
      this.rival.classList.toggle('ahead', rk.place < place);
    }
    if (rHtml !== this.lastHtml.rival) {
      this.rival.textContent = this.lastHtml.rival = rHtml;
      this.rival.classList.toggle('on', !!rHtml);
    }

    // battle: balloons + cats still in
    let bHtml = '';
    if (battle) {
      const left = Math.max(0, m.balloons?.[me] ?? k.balloons);
      const pts = m.battleScore?.[me] ?? 0;
      // one row of balloons (B2: as flex items of the column box they stacked into a 180 px tower on phones)
      bHtml = k.out ? `<span class="out">${t('POPPED')}</span>` : `<span class="row">${'🎈'.repeat(left)}${'<span class="pop">💨</span>'.repeat(Math.max(0, 3 - left))}</span>`;
      bHtml += `<small>★ ${pts === 1 ? t('1 point') : t('{n} points', { n: pts })}</small>`;
    }
    if (bHtml !== this.lastHtml.balloons) {
      this.balloons.innerHTML = this.lastHtml.balloons = bHtml;
      this.balloons.classList.toggle('on', !!bHtml);
    }

    // drift meter: the charge fills across the three tiers; each lit pip is the tier colour and shape
    const tiers = DRIFT.tiers;
    const full = ticks(tiers[tiers.length - 1]);
    const drifting = k.driftDir !== 0 && !k.finished;
    const frac = drifting ? Math.min(1, k.driftCharge / full) : 0;
    const dHtml = drifting ? `${k.driftTier}:${Math.round(frac * 40)}` : '';
    if (dHtml !== this.lastHtml.drift) {
      this.lastHtml.drift = dHtml;
      this.drift.classList.toggle('on', drifting);
      this.driftFill.style.width = `${(frac * 100).toFixed(1)}%`;
      const tierCol = k.driftTier > 0 ? this.tierCols[k.driftTier - 1] : 'rgba(255,243,220,0.7)';
      this.driftFill.style.background = tierCol;
      this.driftPips.forEach((p, i) => p.classList.toggle('lit', drifting && k.driftTier > i));
    }

    const kmh = Math.round(speedOf(k) * 3.6);
    const spHtml = `${kmh}<small>${t('km/h')}</small>`;
    if (spHtml !== this.lastHtml.speed) this.speed.innerHTML = this.lastHtml.speed = spHtml;
    this.drawMap(st, me, colors);
    void topSpeed;
  }

  /** Wrong-way banner: the sim counts it (KartState.wrongTicks, B5); the banner shows from 1.5 s. */
  wrongWay(k: KartState, _t?: BuiltTrack, _dt?: number, racing = true): void {
    const on = racing && !k.finished && k.wrongTicks >= WRONG_BANNER && this.model.mode !== 'battle';
    if (this.wrong.classList.contains('on') !== on) this.wrong.classList.toggle('on', on);
  }

  private drawMap(st: RaceState, me: number, colors: string[]): void {
    const g = this.map.getContext('2d');
    if (!g || !this.mapBg) return;
    g.clearRect(0, 0, MAP, MAP);
    g.drawImage(this.mapBg, 0, 0);
    const rival = this.model.rival?.kart ?? -1;
    const hc = a11y().highContrast;
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < st.karts.length; i++) {
        if ((i === me) !== (pass === 1)) continue;
        const k = st.karts[i];
        if (k.out) continue;
        const [x, y] = this.mapXY(k.x, k.z);
        if (i === me) {
          // the player: a pink arrow showing the heading (x is mirrored on the map)
          const h = k.heading;
          const fx = -Math.sin(h);
          const fy = -Math.cos(h);
          g.beginPath();
          g.moveTo(x + fx * 14, y + fy * 14);
          g.lineTo(x - fx * 8 - fy * 9, y - fy * 8 + fx * 9);
          g.lineTo(x - fx * 8 + fy * 9, y - fy * 8 - fx * 9);
          g.closePath();
          g.fillStyle = '#ff3ea5';
          g.fill();
          g.lineWidth = 4;
          g.strokeStyle = '#2a1a22';
          g.stroke();
          continue;
        }
        g.beginPath();
        g.arc(x, y, hc ? 9 : 7, 0, Math.PI * 2);
        g.fillStyle = colors[i] ?? '#fff';
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = '#2a1a22';
        g.stroke();
        if (i === rival) {
          g.beginPath();
          g.arc(x, y, 13, 0, Math.PI * 2);
          g.lineWidth = 4;
          g.strokeStyle = '#ff4d6d';
          g.stroke();
        }
      }
    // incoming items: red diamonds
    for (const p of this.incomingXZ) {
      const [x, y] = this.mapXY(p.x, p.z);
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#ff4d6d';
      g.fillRect(-6, -6, 12, 12);
      g.lineWidth = 3;
      g.strokeStyle = '#fff3dc';
      g.strokeRect(-6, -6, 12, 12);
      g.restore();
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // the centre message slot (B33)
  // ------------------------------------------------------------------------------------------------------------------

  /** Show a centre message. A higher priority replaces the current one; a lower one waits (up to 1.5 s) or drops. */
  say(text: string, o: SayOpts = {}): void {
    const n = now();
    const prio = o.prio ?? 1;
    const ms = o.ms ?? (prio === 0 ? 3000 : 1400);
    const m: Msg = { text, o: { ...o, prio }, until: n + ms, at: n };
    if (o.id) this.queue = this.queue.filter((q) => q.o.id !== o.id);
    if (!this.cur || this.cur.until <= n || prio >= (this.cur.o.prio ?? 1) || (o.id && this.cur.o.id === o.id)) {
      this.show(m);
      return;
    }
    if (prio === 0) return; // a hint never queues behind a callout
    this.queue.push(m);
    if (this.queue.length > 2) this.queue.shift();
  }

  /** Take down a message by id (current or queued). */
  unsay(id: string): void {
    this.queue = this.queue.filter((q) => q.o.id !== id);
    if (this.cur?.o.id === id) this.next();
  }

  /** The message on screen now (tests, FTUE). */
  get saying(): string | null {
    return this.cur ? this.cur.text : null;
  }

  private show(m: Msg): void {
    this.cur = m;
    const o = m.o;
    this.slot.innerHTML = '';
    this.slot.append(document.createTextNode(m.text));
    if (o.sub) {
      const s = document.createElement('small');
      s.textContent = o.sub;
      this.slot.append(s);
    }
    if (o.strip) {
      const s = document.createElement('div');
      s.className = 'fm-strip';
      s.textContent = o.strip;
      this.slot.append(s);
    }
    this.slot.className = `fm-slot fm-outline on${o.big ? ' big' : ''}${o.prio === 0 ? ' hint' : ''}${o.tone ? ` ${o.tone}` : ''}`;
    // drift tier tones follow the colour-blind setting
    const ti = o.tone ? TIER_TONES.indexOf(o.tone) : -1;
    this.slot.style.color = ti >= 0 ? this.tierCols[ti] : '';
    void this.slot.offsetWidth;
    this.slot.classList.add('pop');
    if (this.slotTimer) clearTimeout(this.slotTimer);
    this.slotTimer = setTimeout(() => this.next(), Math.max(50, m.until - m.at));
  }

  private next(): void {
    const n = now();
    this.cur = null;
    while (this.queue.length) {
      const q = this.queue.shift()!;
      if (n - q.at < 1500) {
        this.show({ ...q, at: n, until: n + Math.max(600, q.until - q.at) });
        return;
      }
    }
    if (this.hintWanted && n < this.hintUntil) {
      this.show({ text: this.hintWanted, o: { prio: 0, id: 'hint' }, at: n, until: this.hintUntil });
      return;
    }
    if (this.slotTimer) clearTimeout(this.slotTimer);
    this.slotTimer = null;
    this.slot.className = 'fm-slot fm-outline';
  }

  private hintUntil = 0;

  clearSay(): void {
    this.queue = [];
    this.hintWanted = null;
    this.next();
  }

  /** The countdown numerals; a pending hint (Pounce Start) sits in a strip below the digit (F13). */
  countdown(text: string): void {
    if (text) this.say(text, { prio: 3, ms: text === t('MEOW!') ? 700 : 950, big: true, id: 'count', strip: this.hintWanted ?? undefined, tone: text === t('MEOW!') ? 'pink' : '' });
    else this.unsay('count');
  }

  /** A good start: the strip under the countdown flashes green "POUNCE!" (F13). */
  private pounceStrip(): void {
    const c = this.cur;
    if (!c || c.o.id !== 'count') return;
    let s = this.slot.querySelector('.fm-strip');
    if (!s) {
      s = document.createElement('div');
      this.slot.append(s);
    }
    s.className = 'fm-strip pounce';
    s.textContent = t('POUNCE!');
    // keep MEOW! up a little longer so the flash is seen
    c.until = Math.max(c.until, now() + 650);
    if (this.slotTimer) clearTimeout(this.slotTimer);
    this.slotTimer = setTimeout(() => this.next(), Math.max(50, c.until - now()));
  }

  flash(text: string, tone: SayTone = '', prio: 0 | 1 | 2 | 3 = 2): void {
    this.say(text, { prio, tone });
  }

  /** "TAP TO RACE": the grid waits for the first input (audio unlocks with it, then 3-2-1). */
  setTapPrompt(text: string | null, sub = ''): void {
    this.tap.innerHTML = '';
    if (text) {
      this.tap.append(document.createTextNode(text));
      if (sub) {
        const s = document.createElement('small');
        s.textContent = sub;
        this.tap.append(s);
      }
    }
    this.tap.classList.toggle('on', !!text);
  }

  get hintText(): string | null {
    return this.hintWanted;
  }

  /** FTUE hints are the lowest priority message (they never cover a banner, and come back when it is gone). */
  setHint(text: string | null): void {
    this.hintWanted = text;
    // while the grid waits for the first tap the prompt pill speaks; the hint rides under the countdown instead
    if (text && this.tap.classList.contains('on')) return;
    if (text) {
      this.hintUntil = now() + 3200;
      this.say(text, { prio: 0, ms: 3200, id: 'hint' });
    } else this.unsay('hint');
  }

  /** React to the player's own events (banners). */
  onEvent(e: RaceEvent, me: number): void {
    if (e.kart !== me && e.kart !== -1) return;
    switch (e.type) {
      case 'countdown':
        this.countdown(String(e.a ?? ''));
        break;
      case 'go':
        this.countdown(t('MEOW!'));
        break;
      case 'pounce':
        this.pounceStrip();
        this.flash(t('PURRFECT START!'), 'pink', 2);
        break;
      case 'stall':
        this.flash(t('*cough* too early'), '', 2);
        break;
      case 'miniTurbo':
        this.flash(t(['', 'ZOOM!', 'ZOOOM!', 'MEOWTURBO!'][e.a ?? 1]), TIER_TONES[Math.max(0, Math.min(2, (e.a ?? 1) - 1))], 1);
        break;
      case 'trick':
        // the pose the kart view strikes for this trick (it poses them in turn, kart-view.ts)
        this.say(t('TRICK!'), { prio: 1, tone: 'gold', sub: t(TRICK_POSES[this.tricks++ % 3]) });
        break;
      case 'finalLap':
        this.flash(t('FINAL LAP'), 'gold', 3);
        break;
      case 'lap':
        this.flash(t('LAP {n}', { n: e.a ?? 0 }), '', 2);
        break;
      case 'itemFizzle':
        this.flash(t('NO ONE AHEAD'), 'cyan', 1);
        break;
      case 'balloonPop':
        this.flash(t('POP!'), 'red', 2);
        break;
      case 'eliminated':
        break;
      case 'finish':
        if (this.model.mode === 'battle') this.say(e.a === 1 ? t('TOP CAT!') : t('TIME!'), { prio: 3, tone: 'gold', ms: 2200 });
        // polish 8: the place lands as a big stamp (it was the size of BIG AIR!), the word under it
        else this.say(ordinalText(e.a ?? 0), { prio: 3, tone: 'gold', ms: 2400, big: true, sub: e.a === 1 ? t('WINNER!') : t('FINISH!') });
        break;
    }
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
    if (!v) {
      this.clearSay();
      this.caption(null);
      this.setArrows([]);
    }
  }

  dispose(): void {
    if (this.slotTimer) clearTimeout(this.slotTimer);
    if (this.capTimer) clearTimeout(this.capTimer);
    this.root.remove();
  }
}
