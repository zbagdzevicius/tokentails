/**
 * ClipPlayer (ANIM-SPEC §2): one pooled playback of a compiled clip: its time-warp, blend-in / blend-out weight,
 * marker and cue cursors. The layer stack owns a fixed pool of these; `start` re-arms one, nothing is created per
 * frame.
 */
import { smooth } from './ease';
import type { ClipBin } from './compile';
import type { Cursor } from './sampler';
import { TimeWarp } from './warp';
import type { AnchorTimes, CueKind, PlayOpts } from './types';

export type MarkerFn = (clipId: string, marker: string) => void;
export type CueFn = (clipId: string, kind: CueKind, arg: string | number | undefined) => void;

export class ClipPlayer {
  bin: ClipBin | null = null;
  readonly warp = new TimeWarp();
  readonly cur: Cursor = { k: 0 };
  /** Clip time (s) and weight (0..1) this frame. */
  t = 0;
  w = 0;
  private startNow = 0;
  private endAt = NaN;
  private outDur = 0.12;
  loop = false;
  mirror = false;
  dir = 0;
  private prevT = -1;
  private first = true;
  /** Was the clip's contact marker passed (for cancel rules)? */
  contacted = false;

  get active(): boolean {
    return this.bin !== null;
  }

  /** Blending out (stop() called or the clip ran to its end)? */
  get ending(): boolean {
    return this.endAt === this.endAt;
  }

  start(bin: ClipBin, anchors: AnchorTimes, now: number, o: PlayOpts): void {
    this.bin = bin;
    this.loop = o.loop === true;
    this.mirror = o.mirror === true;
    this.dir = o.dir ?? 0;
    this.warp.build(bin.def, anchors, now, 0, o.rate ?? 1, o.post ?? 1);
    this.startNow = now;
    this.endAt = NaN;
    this.outDur = bin.blendOut;
    this.cur.k = 0;
    this.t = this.warp.time(now);
    this.prevT = -1;
    this.first = true;
    this.contacted = false;
    this.w = 0;
  }

  /** Re-bind the anchors mid-play (a corrected hit tick, a cast after its windup), keeping the clip time continuous. */
  rebind(anchors: AnchorTimes, now: number): void {
    const b = this.bin;
    if (!b) return;
    this.warp.build(b.def, anchors, now, this.t, 1, this.warp.postRate);
  }

  stop(now: number, dur?: number): void {
    if (!this.bin || this.ending) return;
    this.endAt = now;
    this.outDur = dur ?? this.bin.blendOut;
  }

  kill(): void {
    this.bin = null;
    this.w = 0;
  }

  /** Advance to render time `now` (`dr` render seconds since the last frame). Fires markers and cues crossed. */
  update(now: number, dr: number, onMarker: MarkerFn, onCue: CueFn): void {
    const b = this.bin;
    if (!b) return;
    this.warp.step(dr, now);
    let t = this.warp.time(now);
    if (this.loop) t = t % b.len;
    else if (t > b.len) t = b.len;
    if (t < 0) t = 0;
    this.t = t;
    // markers and cues between the last frame's time and this one (all from 0 on the first frame)
    const from = this.first ? -1 : this.prevT;
    const wrapped = this.loop && t < this.prevT;
    for (let i = 0; i < b.markerNames.length; i++) {
      const mt = b.markerTimes[i];
      if ((mt > from && mt <= t) || (wrapped && (mt > this.prevT || mt <= t))) {
        if (b.markerNames[i] === 'contact') this.contacted = true;
        onMarker(b.id, b.markerNames[i]);
      }
    }
    for (let i = 0; i < b.cues.length; i++) {
      const ct = b.cueTimes[i];
      if ((ct > from && ct <= t) || (wrapped && (ct > this.prevT || ct <= t))) onCue(b.id, b.cues[i][1], b.cues[i][2]);
    }
    this.first = false;
    this.prevT = t;
    // weight: blend in from the start, out from stop() or the clip's tail
    const wi = b.blendIn > 0 ? smooth((now - this.startNow) / b.blendIn) : 1;
    if (!this.loop && !this.ending && t >= b.len - this.outDur) {
      this.endAt = now - Math.max(0, t - (b.len - this.outDur));
    }
    let wo = 1;
    if (this.ending) {
      wo = 1 - smooth((now - this.endAt) / Math.max(1e-3, this.outDur));
      if (wo <= 0) {
        this.kill();
        return;
      }
    }
    this.w = wi * wo;
  }
}
