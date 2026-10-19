/**
 * Juice lane install (LANES.md): one `installJuice(shell)` call from `src/lanes.ts`.
 *
 * What it adds on top of the shell's own listeners (StarterAudio = the full race audio, StarterFeel = trauma and
 * spark bursts, SpeedLines = the combined screen pass):
 *  - hit-stop and the finish slow-mo through `shell.timeScale` (the sim still steps whole ticks)
 *  - kart VFX (boost flames, drift glow, light trails, paw skids, rings, dizzy stars), per-theme sky and ambience,
 *    paw confetti on the finish, screen flashes and the catnip rainbow, style popups, haptics
 *  - the quality auto-scaler (DPR + tier governors, AI outline LOD) in place of `Stage.govern`
 *  - `window.__fmPerf` (fps, DPR, tier, draw calls, triangles) for QA; `?perf=1` draws it on screen
 * Everything reads the race through the JuiceBus; nothing here writes the sim.
 *
 * Iteration 2 (audio-ui lane): every callout goes through `t()`; reduced motion turns off camera shake (from any lane:
 * `camera.addTrauma` is gated here), screen flashes, tints, hit-stop, slow-mo and confetti; the race audio gets the
 * track's song and the race mode.
 */
import type { Object3D } from 'three';
import type { Shell } from '../core/app/shell';
import type { RaceEvent } from '../types';
import { DRIFT } from '../tuning';
import { GO_TICK } from '../core/sim/world';
import type { FrameInfo, JuiceListener } from './bus';
import { vibrate } from './haptics';
import { TimeWarp } from './time';
import { KartFx, boostColor } from './vfx/kart-fx';
import { SkyFx } from './vfx/sky-fx';
import { Confetti } from './vfx/confetti';
import type { PopTone } from './vfx/popups';
import { songIndexForTrack } from './audio/music';
import { reducedMotion } from '../ui/a11y';
import { t } from '../ui/i18n';
import { qa } from '../ui/qa';
import { SpeedLines } from './vfx/speed-lines';
import { Quality, TIERS } from './perf/quality';

const HIT_CALLS = ['BONK!', 'GOTCHA!', 'PURRFECT HIT!'];

/**
 * Overtake chain → callout (localised; chains reset after 3 s without a pass). Same escalation as the v1 popups:
 * P1 takes the lead, then DOUBLE, TRIPLE, MEOWTASTIC for 4+ distinct karts.
 */
export function overtakeCall(chain: number, place: number): { text: string; tone: PopTone; sub?: string } {
  if (place === 1) return { text: t('P1!'), tone: 'gold', sub: chain > 1 ? t('{n} in a row', { n: chain }) : t('take the lead') };
  if (chain >= 4) return { text: t('MEOWTASTIC!'), tone: 'pink', sub: t('{n} in a row', { n: chain }) };
  if (chain === 3) return { text: t('TRIPLE!'), tone: 'pink' };
  if (chain === 2) return { text: t('DOUBLE!'), tone: 'cyan' };
  return { text: t('P{n}', { n: place }), tone: 'cyan' };
}

export class JuiceDirector implements JuiceListener {
  readonly warp = new TimeWarp();
  readonly quality: Quality;
  private kfx: KartFx | null = null;
  private sky: SkyFx | null = null;
  private readonly confetti: Confetti;
  private scaleNow = 1;
  private chain = 0;
  private chainTick = -999;
  /** karts passed in the current chain (B3: a pass-back of the same kart is not a new pass) */
  private chainKarts = new Set<number>();
  /** who passed me last, and when (a pass-back within the chain window cancels it) */
  private passedBy = new Map<number, number>();
  private hitChain = 0;
  private hitTick = -999;
  private myTier = 1;
  private finalLap = false;
  private outlines: Object3D[][] = [];
  private outlineFrame = 0;

  constructor(private readonly shell: Shell) {
    const q = new URLSearchParams(location.search);
    this.warp.enabled = !(Number(q.get('speed')) > 1);
    shell.timeScale = (dt: number) => (this.scaleNow = this.warp.scale(dt));

    // quality: take over the stage's DPR governor
    const stage = shell.stage;
    this.quality = new Quality(stage.renderer, stage.dpr, shell.host);
    // the showroom, garage and podium (no race running) render almost nothing: full sharpness there, min(DPR, 2);
    // the governor only rules while a race owns the canvas
    stage.govern = (dt: number) => {
      const showroom = !shell.setup;
      const want = showroom ? Math.min(2, window.devicePixelRatio || 1) : this.quality.gov.dpr;
      if (Math.abs(stage.dpr - want) > 1e-3) {
        stage.dpr = want;
        stage.renderer.setPixelRatio(want);
        window.dispatchEvent(new Event('resize'));
      }
      if (!showroom) this.quality.sample(dt);
    };
    this.quality.onDpr = (dpr) => {
      stage.dpr = dpr;
      stage.renderer.setPixelRatio(dpr);
      window.dispatchEvent(new Event('resize')); // the shell re-sizes and refreshes the outline resolution
    };
    this.quality.onTier = () => this.applyTier();
    (window as unknown as { __fmPerf?: unknown }).__fmPerf = this.quality.stats;

    this.confetti = new Confetti(shell.camera.cam);
    shell.audio.songOf = () => (shell.setup ? songIndexForTrack(shell.setup.track) : 0);
    shell.audio.modeOf = () => shell.setup?.mode ?? 'race';
    // reduced motion (audio-ui a11y): no camera shake at all, from any lane; QA counts the shakes that got through
    const cam = shell.camera;
    const addTrauma = cam.addTrauma.bind(cam);
    cam.addTrauma = (v: number) => {
      if (reducedMotion() || v <= 0) return;
      qa.shakes++;
      addTrauma(v);
    };
  }

  private applyTier(): void {
    const look = this.quality.look;
    if (this.kfx) this.kfx.opts = { density: look.density, skids: look.skids };
    this.sky?.setDensity(look.ambient);
    if (SpeedLines.current) SpeedLines.current.detail = look.streaks;
  }

  onReset(): void {
    this.kfx?.dispose();
    this.sky?.dispose();
    this.kfx = null;
    this.sky = null;
    this.warp.reset();
    this.confetti.clear();
    this.chain = 0;
    this.chainKarts.clear();
    this.passedBy.clear();
    this.hitChain = 0;
    this.finalLap = false;
    const view = this.shell.view;
    if (!view) return;
    const theme = view.world.theme;
    this.kfx = new KartFx(this.shell.stage.scene, view, theme);
    this.sky = new SkyFx(this.shell.stage.scene, view.track, theme, 1);
    this.applyTier();
    // outline LOD: collect every outline twin per kart once
    this.outlines = view.karts.map((kv) => {
      const list: Object3D[] = [];
      kv.root.traverse((o) => {
        const m = (o as { material?: { name?: string } }).material;
        if (m && m.name === 'cat-outline') list.push(o);
      });
      return list;
    });
  }

  onEvent(e: RaceEvent, info: FrameInfo): void {
    this.kfx?.onEvent(e);
    const me = info.me;
    const mine = e.kart === me;
    // reduced motion: no screen flashes, tints or hit-stops (the colour change still tells the boost apart)
    const calm = reducedMotion();
    const raw = SpeedLines.current;
    const sl = calm && raw ? { flash: () => undefined, tint: () => undefined, setBoostColor: (c: number) => raw.setBoostColor(c), setPulse: (on: boolean) => raw.setPulse(on && !calm) } : raw;
    const warp = calm ? { hitStop: () => undefined, slowMo: () => undefined } : this.warp;
    const theme = this.shell.view?.world.theme;
    const a = e.a ?? 0;
    switch (e.type) {
      case 'hit':
        if (mine) {
          warp.hitStop(0.1, 0.04);
          sl?.flash(0xff4d6d, 0.45, 0.35);
          vibrate([30, 40, 30]);
        } else if (e.b === me) {
          warp.hitStop(0.07, 0.08);
          sl?.flash(0xffffff, 0.18, 0.15);
          this.hitChain = e.tick - this.hitTick < 300 ? this.hitChain + 1 : 1;
          this.hitTick = e.tick;
          this.pop(t(HIT_CALLS[Math.min(HIT_CALLS.length - 1, this.hitChain - 1)]), 'gold');
          this.shell.camera.addTrauma(0.15);
          vibrate(20);
        }
        break;
      case 'wall':
        if (mine && a === 2) warp.hitStop(0.05, 0.12);
        break;
      case 'miniTurbo':
        if (mine) {
          this.myTier = Math.max(1, Math.min(3, a));
          const c = DRIFT.colors[this.myTier - 1];
          sl?.flash(c, 0.08 + 0.07 * this.myTier, 0.25);
          sl?.setBoostColor(c);
          if (this.myTier === 3) warp.hitStop(0.04, 0.3);
          vibrate(8 + this.myTier * 6);
        }
        break;
      case 'boost':
        if (mine && theme) {
          sl?.setBoostColor(boostColor(a, this.myTier, theme));
          if (a === 4) this.pop(t('SLIPSTREAM!'), 'cyan');
        }
        break;
      case 'pounce':
        if (mine) sl?.flash(0xff3ea5, 0.3, 0.4);
        break;
      case 'itemUse':
        if (mine && e.item === 'catnip') sl?.tint(0.6);
        if (mine && e.item === 'zoomies') {
          sl?.tint(1.2);
          sl?.flash(0xff3ea5, 0.3, 0.5);
        }
        break;
      case 'blocked':
        if (mine) this.pop(t('BLOCKED!'), 'cyan');
        break;
      case 'land':
        if (mine && a > 45) this.pop(t('BIG AIR!'), 'gold');
        break;
      case 'overtake':
        if (e.b === me && e.kart !== me) {
          this.passedBy.set(e.kart, e.tick);
          break;
        }
        if (mine && e.tick > GO_TICK && e.b != null) {
          // re-passing a kart that just passed me is not a new pass; a chain counts distinct karts (B3)
          const back = this.passedBy.get(e.b);
          this.passedBy.delete(e.b);
          if (back != null && e.tick - back < 180) break;
          if (e.tick - this.chainTick >= 180) {
            this.chain = 0;
            this.chainKarts.clear();
          }
          this.chainTick = e.tick;
          if (this.chainKarts.has(e.b)) break;
          this.chainKarts.add(e.b);
          this.chain = this.chainKarts.size;
          const c = overtakeCall(this.chain, a);
          this.pop(c.text, c.tone, c.sub);
          vibrate(10);
        }
        break;
      case 'finalLap':
        if (mine) {
          this.finalLap = true;
          sl?.flash(theme?.accent ?? 0xff3ea5, 0.25, 0.5);
        }
        break;
      case 'finish':
        if (mine) {
          warp.slowMo(1.4, 0.3);
          sl?.flash(0xffd27a, 0.5, 0.6);
          sl?.setPulse(false);
          if (!calm) this.confetti.fire(a <= 3, this.quality.look.confetti);
          this.shell.camera.addTrauma(0.3);
          vibrate(a === 1 ? [40, 60, 40, 60, 120] : 40);
        }
        break;
    }
  }

  /** Style callouts go through the HUD's one message slot (B33), below the race banners in priority. */
  private pop(text: string, tone: PopTone, sub?: string): void {
    this.shell.hud.say(text, { prio: 1, tone, sub, ms: 1000 });
  }

  onFrame(info: FrameInfo): void {
    const vdt = info.paused ? 0 : info.dt * this.scaleNow;
    this.kfx?.update(info.st, info.alpha, vdt, info.me);
    this.sky?.update(info.paused ? 0 : info.dt, this.shell.camera.cam);
    this.confetti.update(info.dt);
    const k = info.st.karts[info.me];
    const sl = SpeedLines.current;
    if (sl) {
      sl.detail = this.quality.look.streaks;
      sl.setPulse(!reducedMotion() && this.finalLap && !k.finished && k.place > 1 && info.st.lapLength > 0 && k.s / info.st.lapLength > 0.82);
    }
    // rivals right behind you sit between the chase camera and your kart: fade a kart only when it is between the
    // lens and your kart and covers it on screen (B59), or when it is right at the lens. Rivals beside or ahead of
    // you stay solid.
    const view = this.shell.view;
    if (view) {
      const cp = this.shell.camera.cam.position;
      const fx = k.x - cp.x;
      const fy = k.y + 0.8 - cp.y;
      const fz = k.z - cp.z;
      const dp = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
      for (let i = 0; i < view.karts.length; i++) {
        if (i === info.me) continue;
        const o = info.st.karts[i];
        const ox = o.x - cp.x;
        const oy = o.y + 0.8 - cp.y;
        const oz = o.z - cp.z;
        const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
        const along = (ox * fx + oy * fy + oz * fz) / dp;
        let fade = Math.max(0, Math.min(1, (d - 2) / 1.5));
        if (along > 0 && along < dp - 1.2) {
          const lat = Math.sqrt(Math.max(0, d * d - along * along));
          // the cone towards your kart widens with depth: 1.6 m at the kart, less near the lens
          const r = 1.6 * (along / dp) + 0.6;
          fade = Math.min(fade, Math.max(0.15, Math.min(1, (lat - r) / 1.2 + 0.15)));
        }
        view.karts[i].setFade(fade);
      }
    }
    // outline LOD, 6 times a second
    if (++this.outlineFrame % 10 === 0) {
      const dist = TIERS[this.quality.tier].outlineDist;
      for (let i = 0; i < this.outlines.length; i++) {
        if (i === info.me) continue;
        const o = info.st.karts[i];
        const on = dist > 0 && Math.hypot(o.x - k.x, o.z - k.z) < dist;
        for (const ob of this.outlines[i]) ob.visible = on;
      }
    }
  }
}

export function installJuice(shell: Shell): JuiceDirector {
  const d = new JuiceDirector(shell);
  shell.bus.add(d);
  return d;
}
