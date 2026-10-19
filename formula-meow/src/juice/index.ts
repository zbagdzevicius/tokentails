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
 */
import type { Object3D } from 'three';
import type { Shell } from '../core/app/shell';
import type { RaceEvent } from '../types';
import { DRIFT } from '../tuning';
import { GO_TICK } from '../core/sim/world';
import type { FrameInfo, JuiceListener } from './bus';
import { TimeWarp } from './time';
import { KartFx, boostColor } from './vfx/kart-fx';
import { SkyFx } from './vfx/sky-fx';
import { Confetti } from './vfx/confetti';
import { Popups, overtakeCallout } from './vfx/popups';
import { SpeedLines } from './vfx/speed-lines';
import { Quality, TIERS } from './perf/quality';

function vibrate(p: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(p);
  } catch {
    /* iOS Safari has no vibrate */
  }
}

const HIT_CALLS = ['BONK!', 'GOTCHA!', 'PURRFECT HIT!'];

export class JuiceDirector implements JuiceListener {
  readonly warp = new TimeWarp();
  readonly quality: Quality;
  private kfx: KartFx | null = null;
  private sky: SkyFx | null = null;
  private readonly confetti: Confetti;
  private readonly popups: Popups;
  private scaleNow = 1;
  private chain = 0;
  private chainTick = -999;
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
    stage.govern = (dt: number) => this.quality.sample(dt);
    this.quality.onDpr = (dpr) => {
      stage.dpr = dpr;
      stage.renderer.setPixelRatio(dpr);
      window.dispatchEvent(new Event('resize')); // the shell re-sizes and refreshes the outline resolution
    };
    this.quality.onTier = () => this.applyTier();
    (window as unknown as { __fmPerf?: unknown }).__fmPerf = this.quality.stats;

    this.confetti = new Confetti(shell.camera.cam);
    this.popups = new Popups(shell.host);
    shell.audio.themeOf = () => shell.setup?.track.theme ?? 0;
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
    this.popups.clear();
    this.popups.setVisible(true);
    this.chain = 0;
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
    const sl = SpeedLines.current;
    const theme = this.shell.view?.world.theme;
    const a = e.a ?? 0;
    switch (e.type) {
      case 'hit':
        if (mine) {
          this.warp.hitStop(0.1, 0.04);
          sl?.flash(0xff4d6d, 0.45, 0.35);
          vibrate([30, 40, 30]);
        } else if (e.b === me) {
          this.warp.hitStop(0.07, 0.08);
          sl?.flash(0xffffff, 0.18, 0.15);
          this.hitChain = e.tick - this.hitTick < 300 ? this.hitChain + 1 : 1;
          this.hitTick = e.tick;
          this.popups.show(HIT_CALLS[Math.min(HIT_CALLS.length - 1, this.hitChain - 1)], 'gold');
          this.shell.camera.addTrauma(0.15);
          vibrate(20);
        }
        break;
      case 'wall':
        if (mine && a === 2) this.warp.hitStop(0.05, 0.12);
        break;
      case 'miniTurbo':
        if (mine) {
          this.myTier = Math.max(1, Math.min(3, a));
          const c = DRIFT.colors[this.myTier - 1];
          sl?.flash(c, 0.08 + 0.07 * this.myTier, 0.25);
          sl?.setBoostColor(c);
          if (this.myTier === 3) this.warp.hitStop(0.04, 0.3);
          vibrate(8 + this.myTier * 6);
        }
        break;
      case 'boost':
        if (mine && theme) {
          sl?.setBoostColor(boostColor(a, this.myTier, theme));
          if (a === 4) this.popups.show('SLIPSTREAM!', 'cyan');
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
        if (mine) this.popups.show('BLOCKED!', 'cyan');
        break;
      case 'land':
        if (mine && a > 45) this.popups.show('BIG AIR!', 'gold');
        break;
      case 'overtake':
        if (mine && e.tick > GO_TICK) {
          this.chain = e.tick - this.chainTick < 180 ? this.chain + 1 : 1;
          this.chainTick = e.tick;
          const c = overtakeCallout(this.chain, a);
          this.popups.show(c.text, c.tone, c.sub);
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
          this.warp.slowMo(1.4, 0.3);
          sl?.flash(0xffd27a, 0.5, 0.6);
          sl?.setPulse(false);
          this.confetti.fire(a <= 3, this.quality.look.confetti);
          this.shell.camera.addTrauma(0.3);
          vibrate(a === 1 ? [40, 60, 40, 60, 120] : 40);
          this.popups.setVisible(false);
        }
        break;
    }
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
      sl.setPulse(this.finalLap && !k.finished && k.place > 1 && info.st.lapLength > 0 && k.s / info.st.lapLength > 0.82);
    }
    // rivals right behind you sit between the chase camera and your kart: hide any kart within 4.8 m of the lens (the player sits ~6 m out)
    // (Mario Kart style) so the screen never fills with a cat's head
    const view = this.shell.view;
    if (view) {
      const cp = this.shell.camera.cam.position;
      for (let i = 0; i < view.karts.length; i++) {
        if (i === info.me) continue;
        const o = info.st.karts[i];
        if ((o.x - cp.x) ** 2 + (o.y - cp.y) ** 2 + (o.z - cp.z) ** 2 < 4.8 * 4.8) view.karts[i].root.visible = false;
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
