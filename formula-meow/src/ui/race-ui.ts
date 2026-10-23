/**
 * The race UI feed (audio-ui lane): a JuiceListener that turns the race state into HUD and audio extras the shell
 * does not compute itself. Read-only on the sim.
 *
 *  - incoming items: `HudModel.incoming`, the edge arrows, the mini-map diamonds and the race audio's beeper
 *  - the rival: from `RacerInfo.rival` when no lane set `HudModel.rival`
 *  - battle: the clock from `RaceConfig.timeLimitTicks` (when the mode did not set `timeLeft`), the last-10-seconds
 *    ticks and the time-up horn
 *  - time trial: a chime for every new split (ahead or behind)
 *  - a new record: the announcer line and a "NEW RECORD!" sub line under the finish banner
 *  - captions: every announcer line, when the captions setting is on
 */
import type { Shell } from '../core/app/shell';
import type { RaceEvent } from '../types';
import type { FrameInfo, JuiceListener } from '../juice/bus';
import { GO_TICK } from '../core/sim/world';
import { bestKey } from '../core/app/save';
import { arrowAngle, incomingItems, type Incoming } from '../core/hud/incoming';
import type { HudArrow } from '../core/hud/hud';
import { ANNOUNCE_TEXT } from '../juice/audio/announcer';
import { a11y } from './a11y';
import { t } from './i18n';
import { qa } from './qa';

export class RaceUi implements JuiceListener {
  private readonly inc: Incoming[] = [];
  private readonly arrows: HudArrow[] = [];
  private readonly incModel: Array<{ item: Incoming['item']; eta: number }> = [];
  private readonly incXZ: Array<{ x: number; z: number }> = [];
  private lastSecond = -1;
  private timeUp = false;
  private splits = 0;
  private incWasEmpty = true;

  constructor(private readonly shell: Shell) {
    shell.audio.onLine = (id) => {
      qa.lines++;
      if (a11y().captions && this.shell.world) {
        qa.captions++;
        this.shell.hud.caption(t(ANNOUNCE_TEXT[id]));
      }
    };
  }

  onReset(): void {
    this.lastSecond = -1;
    this.timeUp = false;
    this.splits = 0;
    this.incWasEmpty = true;
    const hud = this.shell.hud;
    if (!hud.hudModel.rival) {
      const i = this.shell.racers.findIndex((r) => r.rival);
      if (i >= 0) hud.setModel({ rival: { kart: i, name: this.shell.racers[i].name } });
    }
  }

  onEvent(e: RaceEvent, info: FrameInfo): void {
    if (e.type !== 'finish' || e.kart !== info.me || !this.shell.setup) return;
    const s = this.shell.setup;
    if ((s.mode ?? 'race') === 'battle') return;
    // a new record: only against a best this device already had (the first finish is not a "record")
    const best = this.shell.progress.bestTimes[bestKey(s.mode ?? 'race', s.track.id, s.cls, s.modifiers)];
    const time = (e.b ?? info.st.karts[info.me].finishTime) / 60;
    if (best != null && time < best - 1e-6) {
      const hud = this.shell.hud;
      const text = hud.saying ?? (e.a === 1 ? t('WINNER!') : t('FINISH!'));
      hud.say(text, { prio: 3, tone: 'gold', ms: 2400, big: !!hud.saying, sub: t('NEW RECORD! {t}', { t: fmt(best - time) }) });
      setTimeout(() => this.shell.audio.announce('record'), 1300);
    }
  }

  onFrame(info: FrameInfo): void {
    const shell = this.shell;
    const hud = shell.hud;
    const st = info.st;
    const w = shell.world;
    // incoming items
    const list = info.paused ? ((this.inc.length = 0), this.inc) : incomingItems(st, info.me, this.inc);
    if (list.length || !this.incWasEmpty) {
      const cam = shell.camera.cam;
      const e = cam.matrixWorld.elements;
      // camera forward = −(third column), flattened
      let fx = -e[8];
      let fz = -e[10];
      const fl = Math.sqrt(fx * fx + fz * fz) || 1;
      fx /= fl;
      fz /= fl;
      this.arrows.length = 0;
      this.incModel.length = 0;
      this.incXZ.length = 0;
      for (const it of list) {
        this.arrows.push({ angle: arrowAngle(cam.position.x, cam.position.z, fx, fz, it.x, it.z), item: it.item, eta: it.eta });
        this.incModel.push({ item: it.item, eta: it.eta });
        this.incXZ.push({ x: it.x, z: it.z });
      }
      hud.setArrows(this.arrows);
      hud.setMinimapExtras(this.incXZ);
      hud.setModel({ incoming: this.incModel.slice() });
      shell.audio.setIncoming(list);
      this.incWasEmpty = list.length === 0;
    }
    if (!w) return;
    // battle clock (from the race config when the mode lane did not set it) + the last-10-seconds ticks
    const limit = w.cfg.timeLimitTicks;
    if (limit && limit > 0) {
      const left = Math.max(0, (GO_TICK + limit - Math.max(GO_TICK, st.tick)) / 60);
      hud.setModel({ timeLeft: left });
      const sec = Math.ceil(left);
      if (st.tick > GO_TICK && sec !== this.lastSecond) {
        this.lastSecond = sec;
        if (sec <= 10 && sec > 0) shell.audio.cue({ id: 'timerTick', prio: 2, n: sec, pitch: 1, delay: 0, vol: 1 });
        if (sec === 0 && !this.timeUp) {
          this.timeUp = true;
          shell.audio.cue({ id: 'timeUp', prio: 3, n: 0, pitch: 1, delay: 0, vol: 1 });
        }
      }
    }
    // time-trial splits: a chime per new split
    const splits = hud.hudModel.splits;
    if (splits && splits.length !== this.splits) {
      if (splits.length > this.splits) {
        const d = splits[splits.length - 1];
        shell.audio.cue({ id: d < 0 ? 'splitAhead' : 'splitBehind', prio: 2, n: 0, pitch: 1, delay: 0, vol: 1 });
      }
      this.splits = splits.length;
    }
  }
}

function fmt(sec: number): string {
  return `−${sec.toFixed(2)}`;
}
