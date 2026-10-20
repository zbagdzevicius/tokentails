/**
 * Lane "feel" install (iteration 2). Owns core/sim/{kart,contact,autopilot}.ts, core/render/**, core/camera/**,
 * juice/vfx/**, juice/{feel,time}.ts, juice/perf/**, items-ai/**, tuning.ts and the numbers in content/karts.ts.
 *
 * The `FeelDirector` (one JuiceBus listener) wires the render side to each race:
 *  - race events → kart animation and render effects (`RaceView.onEvent`: landing puffs, debris, catnip clouds,
 *    trick sparkles, the respawn hand's start point, finish poses)
 *  - the camera: the respawn carry and the wall check (`camera.source`), the intro flyover while the grid waits for
 *    the first input (tap or key skips it; not for `?bot`, `?speed` or reduced motion), the finish orbit, the 10° kick
 *    for strong boosts, a dark dip when the big hand scoops the player up
 *  - post-processing: the lazy bloom chunk on the high quality tier, once the frame rate has shown it can afford it
 *    (2 s at 50+ fps; off again after 2 s under 40 fps, and for good after the second time). `?bloom=1` forces it
 *    on for QA (juice/perf/post.ts)
 *
 * Extension points for other lanes: `shell.setCameraMode('podium' | 'attract' | 'flyover', params)`,
 * `KartView.setFinish(pose)`, `flyoverKeys(track, grid)`.
 */
import type { Shell } from '../app/shell';
import { BoostSource, type RaceEvent } from '../../types';
import { registerStrings } from '../../ui/i18n';
import { FEEL_EN } from '../../ui/strings/feel.en';
import type { FrameInfo, JuiceListener } from '../../juice/bus';
import { SpeedLines } from '../../juice/vfx/speed-lines';
import { Quality } from '../../juice/perf/quality';
import { flyoverKeys } from '../camera/flyover';
import type { PostFx } from '../../juice/perf/post';
import type { Camera, Scene } from 'three';

export class FeelDirector implements JuiceListener {
  private post: PostFx | null = null;
  private postLoading = false;
  private postWanted = false;
  private readonly forcePost: boolean;
  private fpsT = 0;
  private good = 0;
  private bad = 0;
  private strikes = 0;
  private boostGrade = 0;
  private readonly noIntro: boolean;

  constructor(private readonly shell: Shell) {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    this.noIntro = q.has('bot') || Number(q.get('speed')) > 1;
    this.forcePost = q.get('bloom') === '1';
    // tap / key skips the intro flyover (the same input also arms the grid)
    if (typeof window !== 'undefined') {
      const skip = () => shell.camera.skip();
      window.addEventListener('pointerdown', skip);
      window.addEventListener('keydown', skip);
    }
    this.wrapRender();
    // QA (e2e/feel.spec.ts): is the post chain live
    if (typeof window !== 'undefined') (window as unknown as { __fmFeel?: unknown }).__fmFeel = { post: () => !!this.post?.enabled };
  }

  onReset(): void {
    const s = this.shell;
    const view = s.view;
    const world = s.world;
    if (!view || !world) {
      s.camera.source = null;
      return;
    }
    const me = world.cfg.humans[0] ?? 0;
    view.me = me;
    s.camera.source = { track: view.track, me, displayPos: (i, out) => view.displayPos(i, out), displayBasis: (i, out) => view.displayBasis(i, out) };
    s.camera.strongBoost = false;
    // the intro flyover plays while the grid waits for the first input
    const k = world.st.karts[me];
    if (!this.noIntro && !s.settings.reducedMotion && world.st.tick === 0 && k) {
      s.camera.setMode('flyover', { keys: flyoverKeys(view.track, { x: k.x, y: k.y, z: k.z, heading: k.heading, si: k.si }) });
    }
  }

  onEvent(e: RaceEvent, info: FrameInfo): void {
    const s = this.shell;
    s.view?.onEvent(e, info.st);
    if (e.kart !== info.me) return;
    switch (e.type) {
      case 'boost':
        s.camera.strongBoost = e.a === BoostSource.Pad || e.a === BoostSource.Catnip || e.a === BoostSource.Zoomies || e.a === BoostSource.Pounce;
        break;
      case 'miniTurbo':
        s.camera.strongBoost = e.a === 3;
        break;
      case 'pad': // pads boost without a `boost` event
        s.camera.strongBoost = true;
        break;
      case 'respawnStart':
        SpeedLines.current?.flash(0x1a1238, 0.55, 0.6);
        break;
      case 'finish':
        if (s.camera.mode === 'chase') s.camera.setMode('finishOrbit');
        break;
    }
  }

  onFrame(info: FrameInfo): void {
    const cam = this.shell.camera;
    // the countdown started (tap, key, or a chained race): the flyover hands over to the chase rig
    if (cam.mode === 'flyover' && info.st.tick > 0) cam.skip();
    const k = info.st.karts[info.me];
    if (k) this.boostGrade += ((k.boostTicks > 0 ? 1 : 0) - this.boostGrade) * Math.min(1, info.dt * 6);
    this.gatePost(info.dt);
    if (this.post) {
      this.post.boost = this.shell.settings.reducedMotion ? this.boostGrade * 0.4 : this.boostGrade;
      this.post.enabled = this.postWanted;
    } else if (!this.postLoading && this.postWanted) this.loadPost();
  }

  /**
   * Bloom only where it is affordable: the high tier, and a frame rate that holds 50+ fps for 2 s. It switches off
   * after 2 s under 40 fps; after the second time it stays off for the session (no flicker between the two).
   */
  private gatePost(dt: number): void {
    const q = Quality.current;
    if (this.forcePost) {
      this.postWanted = true;
      return;
    }
    if (!q || !q.look.post || this.strikes >= 2) {
      this.postWanted = false;
      this.good = this.bad = 0;
      return;
    }
    this.fpsT += dt;
    if (this.fpsT < 1) return;
    this.fpsT = 0;
    const fps = q.stats.fps;
    if (fps >= 50) {
      this.good++;
      this.bad = 0;
    } else if (fps < 40) {
      this.bad++;
      this.good = 0;
    } else this.good = this.bad = 0;
    if (!this.postWanted && this.good >= 2) this.postWanted = true;
    else if (this.postWanted && this.bad >= 2) {
      this.postWanted = false;
      this.strikes++;
    }
  }

  /** Lazy-load the post chunk (bloom) the first time the high tier is on. */
  private loadPost(): void {
    this.postLoading = true;
    import('../../juice/perf/post')
      .then(({ PostFx }) => {
        this.post = new PostFx(this.shell.stage.renderer);
      })
      .catch((err) => console.warn('[feel] post-processing unavailable', err));
  }

  /**
   * [feel lane] The shell renders with `stage.renderer.render(scene, camera)`; the race camera's frames go through the
   * post chain instead when it is on. Anything else (clips, offscreen targets, other cameras) passes straight through.
   * Contract request: a `shell.renderFrame` hook would replace this wrapper.
   */
  private wrapRender(): void {
    const r = this.shell.stage.renderer;
    const draw = r.render.bind(r);
    r.render = (scene: Scene, camera: Camera) => {
      const p = this.post;
      if (p && p.enabled && camera === this.shell.camera.cam && r.getRenderTarget() === null) {
        try {
          p.render(scene, camera, draw);
          return;
        } catch (err) {
          console.warn('[feel] post-processing failed, turning it off', err);
          p.enabled = false;
          this.post = null;
        }
      }
      draw(scene, camera);
    };
  }
}

export function installFeel(shell: Shell): FeelDirector {
  registerStrings('en', FEEL_EN);
  const d = new FeelDirector(shell);
  shell.bus.add(d);
  return d;
}
