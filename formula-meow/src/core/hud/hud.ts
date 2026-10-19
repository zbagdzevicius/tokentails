/**
 * Race HUD (GDD 11 UI): huge position at top left (the ordinal shakes when it changes), item slot top centre, lap +
 * timer + 96 px mini-map at top right, speed at the bottom, countdown, banners and FTUE hints. DOM, no framework.
 */
import type { ItemId, KartState, RaceEvent, RaceState } from '../../types';
import type { BuiltTrack } from '../track/build';
import { speedOf } from '../sim/kart';

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

export function fmtTime(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return '–:––.––';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

export class Hud {
  readonly root: HTMLDivElement;
  private pos: HTMLDivElement;
  private item: HTMLDivElement;
  private lap: HTMLDivElement;
  private time: HTMLDivElement;
  private speed: HTMLDivElement;
  private count: HTMLDivElement;
  private banner: HTMLDivElement;
  private hint: HTMLDivElement;
  private wrong: HTMLDivElement;
  private map: HTMLCanvasElement;
  private mapBg: HTMLCanvasElement | null = null;
  private lastPlace = 0;
  private lastHtml = { pos: '', item: '', lap: '', time: '', speed: '' };
  private wrongFor = 0;
  private bounds = { minX: 0, minZ: 0, scale: 1 };

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'fm-hud';
    this.root.innerHTML = `
      <div class="fm-pos fm-outline"></div>
      <div class="fm-item fm-sticker empty"></div>
      <div class="fm-right"><div class="fm-lap fm-sticker"></div><div class="fm-time fm-outline"></div><canvas class="fm-map" width="192" height="192"></canvas></div>
      <div class="fm-speed fm-outline"></div>
      <div class="fm-count fm-outline"></div>
      <div class="fm-banner fm-outline"></div>
      <div class="fm-hint fm-outline"></div>
      <div class="fm-wrong fm-outline">⟲ WRONG WAY</div>`;
    parent.appendChild(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.pos = q('.fm-pos');
    this.item = q('.fm-item');
    this.lap = q('.fm-lap');
    this.time = q('.fm-time');
    this.speed = q('.fm-speed');
    this.count = q('.fm-count');
    this.banner = q('.fm-banner');
    this.hint = q('.fm-hint');
    this.wrong = q('.fm-wrong');
    this.map = q('.fm-map');
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
  }

  private mapXY(x: number, z: number): [number, number] {
    // north up: +z is up on the map; mirror x so the map matches the view's handedness
    return [192 - (x - this.bounds.minX) * this.bounds.scale, 192 - (z - this.bounds.minZ) * this.bounds.scale];
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
    const kmh = Math.round(speedOf(k) * 3.6);
    const spHtml = `${kmh}<small>km/h</small>`;
    if (spHtml !== this.lastHtml.speed) this.speed.innerHTML = this.lastHtml.speed = spHtml;
    // wrong way: moving against the track for 1.5 s
    this.drawMap(st, me, colors);
    void topSpeed;
  }

  /** Wrong-way detector (render-side): velocity against the track tangent for 1.5 s. */
  wrongWay(k: KartState, t: BuiltTrack, dt: number, racing: boolean): void {
    const dot = k.vx * t.tx[k.si] + k.vz * t.tz[k.si];
    const fwd = Math.sin(k.heading) * t.tx[k.si] + Math.cos(k.heading) * t.tz[k.si];
    if (racing && !k.finished && (dot < -1 || (Math.abs(dot) < 1 && fwd < -0.5))) this.wrongFor += dt;
    else this.wrongFor = 0;
    this.wrong.classList.toggle('on', this.wrongFor > 1.5);
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
        g.fillStyle = i === me ? '#ff3ea5' : colors[i] ?? '#fff';
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = '#2a1a22';
        g.stroke();
      }
  }

  countdown(text: string): void {
    this.count.textContent = text;
    this.count.classList.remove('pop');
    void this.count.offsetWidth;
    if (text) this.count.classList.add('pop');
  }

  flash(text: string, tone: '' | 'blue' | 'orange' | 'pink' | 'gold' = ''): void {
    this.banner.textContent = text;
    this.banner.className = `fm-banner fm-outline ${tone}`;
    void this.banner.offsetWidth;
    this.banner.classList.add('on');
  }

  setHint(text: string | null): void {
    if (text) this.hint.textContent = text;
    this.hint.classList.toggle('on', !!text);
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
        setTimeout(() => this.countdown(''), 700);
        break;
      case 'pounce':
        this.flash('PURRFECT START!', 'pink');
        break;
      case 'stall':
        this.flash('*cough* too early', '');
        break;
      case 'miniTurbo':
        this.flash(['', 'ZOOM!', 'ZOOOM!', 'MEOWTURBO!'][e.a ?? 1], (['', 'blue', 'orange', 'pink'] as const)[e.a ?? 1]);
        break;
      case 'trick':
        this.flash('TRICK!', 'gold');
        break;
      case 'finalLap':
        this.flash('FINAL LAP', 'gold');
        break;
      case 'lap':
        this.flash(`LAP ${e.a}`, '');
        break;
      case 'finish':
        this.flash(e.a === 1 ? 'WINNER!' : `FINISH! ${e.a}${['th', 'st', 'nd', 'rd'][e.a ?? 0] ?? 'th'}`, 'gold');
        break;
    }
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}
