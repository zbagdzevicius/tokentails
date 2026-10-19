/**
 * Race HUD (GDD 11 UI): huge position at top left (the ordinal shakes when it changes), item slot top centre, lap +
 * timer + 96 px mini-map at top right, speed at the bottom, and ONE centre message slot (`say`, B33): countdown,
 * banners, callouts and FTUE hints all go through it by priority, so they never pile up. DOM, no framework.
 *
 * Iteration 2 contract: `say(text, { prio, ms, sub })` and `HudModel` (`setModel`: coins, rival, balloons, time
 * left, splits, GP race, incoming items, mode tag). Modes and progression fill the model through `shell.hudExtras`;
 * the audio-ui lane owns how it looks.
 */
import type { ItemId, KartState, RaceEvent, RaceMode, RaceState } from '../../types';
import type { BuiltTrack } from '../track/build';
import { speedOf } from '../sim/kart';
import { PHYS, ticks } from '../../tuning';

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
const ROULETTE = Object.values(ITEM_ICON);

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}<small>${s}</small>`;
}

export function ordinalText(n: number): string {
  return ordinal(n).replace(/<\/?small>/g, '');
}

export function fmtTime(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return '–:––.––';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
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

interface Msg {
  text: string;
  o: SayOpts;
  until: number;
  at: number;
}

const WRONG_BANNER = ticks(PHYS.wrongWay);

export class Hud {
  readonly root: HTMLDivElement;
  private pos: HTMLDivElement;
  private item: HTMLDivElement;
  private lap: HTMLDivElement;
  private time: HTMLDivElement;
  private tag: HTMLDivElement;
  private coins: HTMLDivElement;
  private speed: HTMLDivElement;
  private slot: HTMLDivElement;
  private wrong: HTMLDivElement;
  private tap: HTMLDivElement;
  private map: HTMLCanvasElement;
  private mapBg: HTMLCanvasElement | null = null;
  private lastPlace = 0;
  private lastHtml = { pos: '', item: '', lap: '', time: '', speed: '', tag: '', coins: '' };
  private bounds = { minX: 0, minZ: 0, scale: 1 };
  private cur: Msg | null = null;
  private queue: Msg[] = [];
  private slotTimer: ReturnType<typeof setTimeout> | null = null;
  private model: HudModel = emptyHudModel();
  /** the FTUE hint that should be up (it rides under the countdown numbers, and comes back when the slot frees) */
  private hintWanted: string | null = null;
  /** B58: no per-frame allocation for the map */
  private readonly xy: [number, number] = [0, 0];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'fm-hud';
    this.root.innerHTML = `
      <div class="fm-pos fm-outline"></div>
      <div class="fm-item fm-sticker empty" aria-hidden="true"></div>
      <div class="fm-right"><div class="fm-lap fm-sticker"></div><div class="fm-time fm-outline"></div><div class="fm-tag fm-outline"></div><canvas class="fm-map" width="192" height="192"></canvas><div class="fm-coins fm-outline"></div></div>
      <div class="fm-speed fm-outline"></div>
      <div class="fm-slot fm-outline" role="status" aria-live="polite"></div>
      <div class="fm-tap"></div>
      <div class="fm-wrong fm-outline">⟲ WRONG WAY</div>`;
    parent.appendChild(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.pos = q('.fm-pos');
    this.item = q('.fm-item');
    this.lap = q('.fm-lap');
    this.time = q('.fm-time');
    this.tag = q('.fm-tag');
    this.coins = q('.fm-coins');
    this.speed = q('.fm-speed');
    this.slot = q('.fm-slot');
    this.wrong = q('.fm-wrong');
    this.tap = q('.fm-tap');
    this.map = q('.fm-map');
  }

  /** Touch layout: the top item slot is display-only, the real button is bottom right (B45). */
  setTouch(on: boolean): void {
    this.root.classList.toggle('touch', on);
  }

  /** Pre-render the track outline for the mini-map. */
  setTrack(t: BuiltTrack, accent: string): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < t.n; i++) {
      minX = Math.min(minX, t.px[i]);
      maxX = Math.max(maxX, t.px[i]);
      minZ = Math.min(minZ, t.pz[i]);
      maxZ = Math.max(maxZ, t.pz[i]);
    }
    const pad = 14;
    const size = 192;
    const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    this.bounds = { minX: minX - (size / scale - (maxX - minX)) / 2, minZ: minZ - (size / scale - (maxZ - minZ)) / 2, scale };
    const bg = document.createElement('canvas');
    bg.width = bg.height = size;
    const g = bg.getContext('2d');
    if (g) {
      g.lineCap = g.lineJoin = 'round';
      const path = () => {
        g.beginPath();
        for (let i = 0; i <= t.n; i += 4) {
          const [x, y] = this.mapXY(t.px[i % t.n], t.pz[i % t.n]);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
      };
      path();
      g.strokeStyle = '#2a1a22';
      g.lineWidth = 16;
      g.stroke();
      path();
      g.strokeStyle = '#fff3dc';
      g.lineWidth = 9;
      g.stroke();
      const [sx, sy] = this.mapXY(t.px[0], t.pz[0]);
      g.fillStyle = accent;
      g.fillRect(sx - 6, sy - 6, 12, 12);
    }
    this.mapBg = bg;
    this.clearSay();
    this.model = { ...emptyHudModel(), showCoins: t.coins.length > 0 };
  }

  private mapXY(x: number, z: number): [number, number] {
    // north up: +z is up on the map; mirror x so the map matches the view's handedness
    this.xy[0] = 192 - (x - this.bounds.minX) * this.bounds.scale;
    this.xy[1] = 192 - (z - this.bounds.minZ) * this.bounds.scale;
    return this.xy;
  }

  /** Merge fields into the HUD model (modes, progression and the shell call this through `shell.hudExtras`). */
  setModel(m: Partial<HudModel>): void {
    this.model = { ...this.model, ...m };
  }

  get hudModel(): Readonly<HudModel> {
    return this.model;
  }

  update(st: RaceState, me: number, topSpeed: number, goTick: number, colors: string[]): void {
    const k = st.karts[me];
    // position
    const place = k.place;
    const posHtml = ordinal(place);
    if (posHtml !== this.lastHtml.pos) {
      this.pos.innerHTML = posHtml + '<small>/' + st.karts.length + '</small>';
      this.lastHtml.pos = posHtml;
      if (this.lastPlace && place !== this.lastPlace) {
        this.pos.classList.remove('bump');
        void this.pos.offsetWidth;
        this.pos.classList.add('bump');
      }
      this.pos.classList.toggle('p1', place === 1);
      this.lastPlace = place;
    }
    // item
    let itemHtml = '';
    if (k.item && k.rouletteTicks > 0) itemHtml = ROULETTE[Math.floor(st.tick / (2 + (72 - k.rouletteTicks) / 12)) % ROULETTE.length];
    else if (k.item) itemHtml = ITEM_ICON[k.item] + (k.itemCount > 1 ? `<span class="n">×${k.itemCount}</span>` : '');
    if (itemHtml !== this.lastHtml.item) {
      this.item.innerHTML = itemHtml;
      this.item.classList.toggle('empty', !k.item);
      this.lastHtml.item = itemHtml;
    }
    // lap + time
    const lapN = Math.max(1, Math.min(st.laps, k.lap));
    const lapHtml = `LAP ${lapN}/${st.laps}`;
    if (lapHtml !== this.lastHtml.lap) this.lap.textContent = this.lastHtml.lap = lapHtml;
    const t = k.finished ? k.finishTime / 60 : Math.max(0, st.tick - goTick) / 60;
    const tHtml = fmtTime(t);
    if (tHtml !== this.lastHtml.time) this.time.textContent = this.lastHtml.time = tHtml;
    const tagHtml = this.model.tag ?? '';
    if (tagHtml !== this.lastHtml.tag) {
      this.tag.textContent = this.lastHtml.tag = tagHtml;
      this.tag.classList.toggle('on', !!tagHtml);
    }
    const coinHtml = this.model.showCoins ? `🐟 ${k.coins}` : '';
    if (coinHtml !== this.lastHtml.coins) {
      this.coins.textContent = this.lastHtml.coins = coinHtml;
      this.coins.classList.toggle('on', !!coinHtml);
    }
    const kmh = Math.round(speedOf(k) * 3.6);
    const spHtml = `${kmh}<small>km/h</small>`;
    if (spHtml !== this.lastHtml.speed) this.speed.innerHTML = this.lastHtml.speed = spHtml;
    this.drawMap(st, me, colors);
    void topSpeed;
  }

  /** Wrong-way banner: the sim counts it (KartState.wrongTicks, B5); the banner shows from 1.5 s. */
  wrongWay(k: KartState, _t?: BuiltTrack, _dt?: number, racing = true): void {
    this.wrong.classList.toggle('on', racing && !k.finished && k.wrongTicks >= WRONG_BANNER);
  }

  private drawMap(st: RaceState, me: number, colors: string[]): void {
    const g = this.map.getContext('2d');
    if (!g || !this.mapBg) return;
    g.clearRect(0, 0, 192, 192);
    g.drawImage(this.mapBg, 0, 0);
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < st.karts.length; i++) {
        if ((i === me) !== (pass === 1)) continue;
        const k = st.karts[i];
        const [x, y] = this.mapXY(k.x, k.z);
        g.beginPath();
        g.arc(x, y, i === me ? 10 : 7, 0, Math.PI * 2);
        g.fillStyle = i === me ? '#ff3ea5' : (colors[i] ?? '#fff');
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = '#2a1a22';
        g.stroke();
      }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // the centre message slot (B33)
  // ------------------------------------------------------------------------------------------------------------------

  /** Show a centre message. A higher priority replaces the current one; a lower one waits (up to 1.5 s) or drops. */
  say(text: string, o: SayOpts = {}): void {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const prio = o.prio ?? 1;
    const ms = o.ms ?? (prio === 0 ? 3000 : 1400);
    const m: Msg = { text, o: { ...o, prio }, until: now + ms, at: now };
    if (o.id) this.queue = this.queue.filter((q) => q.o.id !== o.id);
    if (!this.cur || this.cur.until <= now || prio >= (this.cur.o.prio ?? 1) || (o.id && this.cur.o.id === o.id)) {
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
    this.slot.className = `fm-slot fm-outline on${o.big ? ' big' : ''}${o.prio === 0 ? ' hint' : ''}${o.tone ? ` ${o.tone}` : ''}`;
    void this.slot.offsetWidth;
    this.slot.classList.add('pop');
    if (this.slotTimer) clearTimeout(this.slotTimer);
    this.slotTimer = setTimeout(() => this.next(), Math.max(50, m.until - m.at));
  }

  private next(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    this.cur = null;
    while (this.queue.length) {
      const q = this.queue.shift()!;
      if (now - q.at < 1500) {
        this.show({ ...q, at: now, until: now + Math.max(600, q.until - q.at) });
        return;
      }
    }
    if (this.hintWanted && now < this.hintUntil) {
      this.show({ text: this.hintWanted, o: { prio: 0, id: 'hint' }, at: now, until: this.hintUntil });
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

  /** The countdown numerals; a pending hint (Pounce Start) rides under them as the sub line. */
  countdown(text: string): void {
    if (text) this.say(text, { prio: 3, ms: text === 'MEOW!' ? 700 : 950, big: true, id: 'count', sub: this.hintWanted ?? undefined });
    else this.unsay('count');
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
      this.hintUntil = (typeof performance !== 'undefined' ? performance.now() : 0) + 3200;
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
        this.countdown('MEOW!');
        break;
      case 'pounce':
        this.flash('PURRFECT START!', 'pink', 2);
        break;
      case 'stall':
        this.flash('*cough* too early', '', 2);
        break;
      case 'miniTurbo':
        this.flash(['', 'ZOOM!', 'ZOOOM!', 'MEOWTURBO!'][e.a ?? 1], (['', 'blue', 'orange', 'pink'] as const)[e.a ?? 1], 1);
        break;
      case 'trick':
        this.flash('TRICK!', 'gold', 1);
        break;
      case 'finalLap':
        this.flash('FINAL LAP', 'gold', 3);
        break;
      case 'lap':
        this.flash(`LAP ${e.a}`, '', 2);
        break;
      case 'itemFizzle':
        this.flash('NO ONE AHEAD', 'cyan', 1);
        break;
      case 'finish':
        this.say(e.a === 1 ? 'WINNER!' : `FINISH! ${ordinalText(e.a ?? 0)}`, { prio: 3, tone: 'gold', ms: 2200 });
        break;
    }
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
    if (!v) this.clearSay();
  }

  dispose(): void {
    if (this.slotTimer) clearTimeout(this.slotTimer);
    this.root.remove();
  }
}
