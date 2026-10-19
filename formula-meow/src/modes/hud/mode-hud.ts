/**
 * Mode HUD (modes lane, render only, a JuiceBus listener): what a mode needs on screen beyond the race HUD.
 *
 * - Battle: the round clock, your balloons, every cat's balloons, balloons floating over the karts (one instanced
 *   mesh and one line batch), pops and steals called out through `hud.say`, cats that are out turn see-through.
 * - Time trial: the split against the ghost at every checkpoint (green ahead, red behind) through `hud.say`.
 * - Grand Prix: the rival chip with the rival's live place.
 *
 * It also fills the HudModel fields (`balloons`, `timeLeft`, `splits`, `rival`) through `shell.hudExtras`, so the
 * audio-ui lane's HUD can take these over. The race HUD's place and lap counters are hidden in battle (and the place
 * in a time trial) with a `data-fm-mode` attribute on the HUD root.
 */
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, InstancedMesh, LineBasicMaterial, LineSegments, Object3D, SphereGeometry } from 'three';
import type { RaceEvent } from '../../types';
import type { Shell } from '../../core/app/shell';
import type { FrameInfo, JuiceListener } from '../../juice/bus';
import { toonMaterial } from '../../core/render/toon';
import { GO_TICK } from '../../core/sim/world';
import { ordinalText } from '../../core/hud/hud';
import { t } from '../../ui/i18n';
import { BATTLE, BATTLE_TICKS } from '../battle/rules';
import { flow, fmtDelta } from '../flow';

const MAX_B = BATTLE.maxBalloons;
const _o = new Object3D();
const _c = new Color();

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export class ModeHud implements JuiceListener {
  private readonly root: HTMLDivElement;
  private readonly clock: HTMLDivElement;
  private readonly mine: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly rival: HTMLDivElement;
  private mode: string | null = null;
  private lastHtml = { clock: '', mine: '', list: '', rival: '' };
  private balloons: InstancedMesh | null = null;
  private strings: LineSegments | null = null;
  private snap = { x: 0, y: 0, z: 0, heading: 0 };
  private time = 0;
  private faded = new Set<number>();
  private splits: number[] = [];

  constructor(private readonly shell: Shell) {
    this.root = document.createElement('div');
    this.root.className = 'fm-mode-hud';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = '<div class="fm-mh-clock fm-outline"></div><div class="fm-mh-mine fm-outline"></div><div class="fm-mh-list"></div><div class="fm-mh-rival fm-sticker"></div>';
    shell.host.appendChild(this.root);
    // menus, results and the podium (where no race frame runs to hide it) cover the mode HUD
    shell.screens.onChange((top) => {
      if (top || !shell.world) this.root.classList.remove('on');
    });
    const q = (s: string) => this.root.querySelector(s) as HTMLDivElement;
    this.clock = q('.fm-mh-clock');
    this.mine = q('.fm-mh-mine');
    this.list = q('.fm-mh-list');
    this.rival = q('.fm-mh-rival');
  }

  onReset(): void {
    this.disposeBalloons();
    this.faded.clear();
    this.splits = [];
    this.lastHtml = { clock: '', mine: '', list: '', rival: '' };
    const w = this.shell.world;
    const mode = w && !this.shell.attract ? (w.cfg.mode ?? 'race') : null;
    this.mode = mode === 'battle' || mode === 'tt' || mode === 'gp' ? mode : null;
    this.root.dataset.mode = this.mode ?? '';
    // the race HUD hides what means nothing in this mode (its root is the shell's; only this attribute is ours)
    if (this.mode) this.shell.hud.root.dataset.fmMode = this.mode;
    else delete this.shell.hud.root.dataset.fmMode;
    if (this.mode === 'battle' && w) this.buildBalloons(w.st.karts.length);
  }

  private buildBalloons(n: number): void {
    const geo = new SphereGeometry(0.34, 10, 8);
    geo.scale(1, 1.18, 1);
    this.balloons = new InstancedMesh(geo, toonMaterial({ color: 0xffffff }), n * MAX_B);
    this.balloons.instanceMatrix.setUsage(DynamicDrawUsage);
    this.balloons.frustumCulled = false;
    const lines = new BufferGeometry();
    const pos = new BufferAttribute(new Float32Array(n * MAX_B * 2 * 3), 3);
    pos.setUsage(DynamicDrawUsage);
    lines.setAttribute('position', pos);
    this.strings = new LineSegments(lines, new LineBasicMaterial({ color: 0x2a1a22, transparent: true, opacity: 0.6 }));
    this.strings.frustumCulled = false;
    const racers = this.shell.racers;
    for (let i = 0; i < n; i++) for (let b = 0; b < MAX_B; b++) this.balloons.setColorAt(i * MAX_B + b, _c.setHex(racers[i]?.kart.paint[0] ?? 0xff3ea5));
    this.shell.stage.scene.add(this.balloons, this.strings);
  }

  private disposeBalloons(): void {
    for (const m of [this.balloons, this.strings]) {
      if (!m) continue;
      this.shell.stage.scene.remove(m);
      m.geometry.dispose();
      (m.material as { dispose(): void }).dispose();
    }
    this.balloons?.dispose();
    this.balloons = null;
    this.strings = null;
  }

  onEvent(e: RaceEvent, info: FrameInfo): void {
    if (!this.mode) return;
    const st = info.st;
    const me = info.me;
    const racers = this.shell.racers;
    const name = (i: number) => racers[i]?.name ?? '';
    const hud = this.shell.hud;
    if (this.mode === 'battle') {
      if (e.type === 'balloonPop' || e.type === 'balloonSteal') {
        const k = st.karts[e.kart];
        const view = this.shell.view;
        if (view) view.burst(k.x, k.y + 2.7, k.z, racers[e.kart]?.kart.paint[0] ?? 0xff3ea5, 16, 6);
        const steal = e.type === 'balloonSteal';
        if (e.kart === me) hud.say(steal ? t('STOLEN!') : t('POP!'), { prio: 2, tone: 'red', sub: k.balloons > 0 ? t('{n} left', { n: k.balloons }) : undefined });
        else if (e.b === me) hud.say(steal ? t('YOINK!') : t('POP!'), { prio: 2, tone: 'green', sub: name(e.kart) });
      }
      if (e.type === 'eliminated') {
        const kv = this.shell.view?.karts[e.kart];
        if (kv && !this.faded.has(e.kart)) {
          kv.setGhost(0.35);
          this.faded.add(e.kart);
        }
        if (e.kart === me) hud.say(t('OUT!'), { prio: 3, tone: 'red', ms: 2200, sub: t('The round ends in a moment') });
        else hud.say(t('{name} is out!', { name: name(e.kart) }), { prio: 1, tone: 'gold' });
      }
    }
    if (this.mode === 'tt' && e.type === 'checkpoint' && e.kart === me) {
      const c = e.a ?? 0;
      const mine = (e.b ?? 0) / 60;
      const ghost = flow().ghostSplit(c);
      if (ghost != null) {
        const d = mine - ghost;
        this.splits[c] = d;
        this.shell.hudExtras({ splits: this.splits.slice() });
        const lapEnd = (c + 1) % 3 === 0;
        hud.say(fmtDelta(d), { prio: lapEnd ? 2 : 1, tone: d <= 0 ? 'green' : 'red', ms: 1500 });
      }
    }
  }

  onFrame(info: FrameInfo): void {
    const on = !!this.mode && !this.shell.screens.top() && this.shell.hud.root.style.display !== 'none';
    this.root.classList.toggle('on', on);
    if (!this.mode) return;
    this.time += info.dt;
    if (this.mode === 'battle') this.frameBattle(info, on);
    else if (this.mode === 'gp') this.frameGp(info, on);
  }

  private set(key: keyof ModeHud['lastHtml'], el: HTMLElement, html: string): void {
    if (this.lastHtml[key] === html) return;
    this.lastHtml[key] = html;
    el.innerHTML = html;
  }

  private frameBattle(info: FrameInfo, on: boolean): void {
    const st = info.st;
    const ks = st.karts;
    const left = Math.max(0, Math.ceil((BATTLE_TICKS - Math.max(0, st.tick - GO_TICK)) / 60));
    if (on) {
      const m = Math.floor(left / 60);
      const s = left - m * 60;
      this.set('clock', this.clock, `<span class="${left <= 10 && st.phase === 'race' ? 'hot' : ''}">⏱ ${m}:${s < 10 ? '0' : ''}${s}</span>`);
      const me = ks[info.me];
      this.set('mine', this.mine, me.out ? `<b class="out">${t('OUT')}</b>` : `${'🎈'.repeat(Math.max(0, me.balloons))}`);
      const racers = this.shell.racers;
      const rows = ks
        .map((k, i) => ({ k, i }))
        .sort((a, b) => a.k.out - b.k.out || b.k.balloons - a.k.balloons || a.i - b.i)
        .map(({ k, i }) => `<div class="r${i === info.me ? ' me' : ''}${k.out ? ' out' : ''}"><i style="background:${hex(racers[i]?.kart.paint[0] ?? 0xffffff)}"></i><span>${escHtml((racers[i]?.name ?? '').slice(0, 9))}</span><b>${k.out ? '✕' : k.balloons}</b></div>`)
        .join('');
      this.set('list', this.list, rows);
      if (this.lastLeft !== left) {
        this.lastLeft = left;
        this.shell.hudExtras({ balloons: ks.map((k) => k.balloons), timeLeft: left });
      }
    }
    // balloons over the karts
    const bm = this.balloons;
    const sm = this.strings;
    const view = this.shell.view;
    if (!bm || !sm || !view) return;
    const pos = sm.geometry.getAttribute('position') as BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      const s = view.lerpKart(i, info.alpha, this.snap);
      const n = k.out || k.respawnTicks > 0 ? 0 : Math.min(MAX_B, k.balloons);
      for (let b = 0; b < MAX_B; b++) {
        const id = i * MAX_B + b;
        const L = id * 6;
        if (b >= n) {
          _o.scale.setScalar(0);
          _o.position.set(0, -100, 0);
          _o.updateMatrix();
          bm.setMatrixAt(id, _o.matrix);
          arr.fill(0, L, L + 6);
          continue;
        }
        // a little bunch behind the driver, bobbing out of phase
        const a = (b - (n - 1) / 2) * 0.55;
        const back = -0.6;
        const bx = s.x + Math.sin(s.heading) * back + Math.cos(s.heading) * a * 0.9;
        const bz = s.z + Math.cos(s.heading) * back - Math.sin(s.heading) * a * 0.9;
        const by = s.y + 2.55 + Math.sin(this.time * 3 + i + b * 1.7) * 0.08 + (b % 2) * 0.22;
        _o.position.set(bx, by, bz);
        _o.rotation.set(0, 0, a * 0.3);
        _o.scale.setScalar(1);
        _o.updateMatrix();
        bm.setMatrixAt(id, _o.matrix);
        arr[L] = bx;
        arr[L + 1] = by - 0.36;
        arr[L + 2] = bz;
        arr[L + 3] = s.x + Math.sin(s.heading) * -0.3;
        arr[L + 4] = s.y + 1.25;
        arr[L + 5] = s.z + Math.cos(s.heading) * -0.3;
      }
    }
    bm.instanceMatrix.needsUpdate = true;
    pos.needsUpdate = true;
  }

  private lastLeft = -1;

  private frameGp(info: FrameInfo, on: boolean): void {
    if (!on) return;
    const r = this.shell.hud.hudModel.rival;
    if (!r) {
      this.set('rival', this.rival, '');
      return;
    }
    const k = info.st.karts[r.kart];
    this.set('rival', this.rival, k ? `<small>${t('RIVAL')}</small> ${escHtml(r.name)} · ${ordinalText(k.place)}` : '');
  }
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
