/**
 * L-AUDIO: streams the Back on Track mix (licensed by the founder) as 30 s AAC segments and plays
 * them back to back on the AudioContext.
 *
 * Sources (client/public/music/back-on-track-v1, synced to the CDN on every push to main): the
 * manifest and beat map load same-origin first, the segments try the CDN first (same-origin on
 * localhost). The first failure of a base moves the session to the other one; `?mixBase=` overrides
 * both. Each segment starts at an absolute time (anchor + its start), so drift can never build up;
 * seams are hard abutments (the files carry 4096 samples of padding each side, so the decoder's
 * priming never eats into the core). Never more than 3 decoded segments (~32 MB) are kept.
 */
import { parseBeatmap, parseManifest, type MixBeatmap, type MixManifest } from './beatmap';

export const MIX_SAME_ORIGIN = '/music/back-on-track-v1/';
export const MIX_CDN = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/w/music/back-on-track-v1/';
export const MIX_MANIFEST = 'bot-v1-manifest.json';
/** Output level of the mix (the synth master sits at 0.62). */
const MIX_GAIN = 0.8;
/** Schedule the next segment this long before it is due. */
const SCHEDULE_AHEAD = 8;
const KEEP_BUFFERS = 3;
const RETRY_MS = 1000;
/** One fetch attempt gives up after this long (a stalled connection never errors on its own). */
const ATTEMPT_MS = 8000;
/** A segment still missing this long after it was due: the mix has stalled, hand back to the synth. */
const STALL_SEC = 10;

export interface MixLoader {
  load(): Promise<{ manifest: MixManifest; map: MixBeatmap }>;
  segment(i: number, signal: AbortSignal): Promise<ArrayBuffer>;
}

const withSlash = (b: string) => (b.endsWith('/') ? b : `${b}/`);

export function createMixLoader(opts: { base?: string } = {}): MixLoader {
  const override = opts.base ? withSlash(opts.base) : null;
  const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  let manifest: MixManifest | null = null;
  let loading: Promise<{ manifest: MixManifest; map: MixBeatmap }> | null = null;
  let sameBase = MIX_SAME_ORIGIN;
  let cdnBase = MIX_CDN;
  /** Order the segment bases are tried in; a failure swaps them for the rest of the session. */
  let segOrder: string[] = [];

  const sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      };
      const t = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });

  /** One try on each base, then once more on the first after 1 s. Swaps `order` on a failure. */
  async function fetchFrom(order: string[], file: string, kind: 'json' | 'bin', signal?: AbortSignal): Promise<unknown> {
    const tries = order.length > 1 ? [order[0], order[1], order[0]] : [order[0], order[0]];
    let last: unknown = null;
    for (let k = 0; k < tries.length; k++) {
      if (k === tries.length - 1) await sleep(RETRY_MS, signal);
      const base = tries[k];
      // Own controller per attempt: the caller's abort, or a timeout that moves on to the next base.
      const attempt = new AbortController();
      const onAbort = () => attempt.abort();
      signal?.addEventListener('abort', onAbort);
      const timer = setTimeout(() => attempt.abort(), ATTEMPT_MS);
      try {
        const res = await fetch(base + file, { cache: 'force-cache', signal: attempt.signal, credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = kind === 'json' ? await res.json() : await res.arrayBuffer();
        if (base !== order[0] && order.length > 1) order.reverse(); // the other base worked: keep using it
        return body;
      } catch (err) {
        if (signal?.aborted) throw err;
        last = attempt.signal.aborted ? new Error(`${file} timed out`) : err;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    }
    throw last instanceof Error ? last : new Error(`could not load ${file}`);
  }

  return {
    load() {
      if (loading) return loading;
      loading = (async () => {
        const order = override ? [override] : [MIX_SAME_ORIGIN, MIX_CDN];
        const m = parseManifest(await fetchFrom(order, MIX_MANIFEST, 'json'));
        if (!override) {
          sameBase = m.sameOriginBase.startsWith('/') ? withSlash(m.sameOriginBase) : MIX_SAME_ORIGIN;
          cdnBase = /^https:\/\//.test(m.cdnBase) ? withSlash(m.cdnBase) : MIX_CDN;
        }
        const map = parseBeatmap(await fetchFrom(override ? [override] : order[0] === MIX_CDN ? [cdnBase, sameBase] : [sameBase, cdnBase], m.beatmap, 'json'));
        segOrder = override ? [override] : local ? [sameBase] : [cdnBase, sameBase];
        manifest = m;
        return { manifest: m, map };
      })();
      loading.catch(() => (loading = null)); // a later toggle may try again
      return loading;
    },
    async segment(i, signal) {
      if (!manifest) await this.load();
      const seg = manifest!.segments[i];
      if (!seg) throw new Error(`no segment ${i}`);
      return (await fetchFrom(segOrder, seg.url, 'bin', signal)) as ArrayBuffer;
    },
  };
}

interface Playing {
  src: AudioBufferSourceNode;
  /** Context time it stops sounding. */
  end: number;
}

/** WebAudio player of the segmented mix. `start` seeks; `pump` (every 25 ms) keeps it fed. */
export class MixPlayer {
  onError: (err: Error) => void = () => {};
  private readonly out: GainNode;
  private session: GainNode | null = null;
  /** The last stopped session's gain: a seek that starts before its fade-out cuts it then. */
  private retired: AudioParam | null = null;
  /** Context time start() wants its first segment to sound (the stall watchdog), or null. */
  private startDue: number | null = null;
  private readonly buffers = new Map<number, AudioBuffer>();
  private readonly pending = new Map<number, Promise<AudioBuffer>>();
  private abort = new AbortController();
  private playing: Playing[] = [];
  /** Context time of track time 0 in the loop playback started in. */
  private anchor0: number | null = null;
  /** Next segment to schedule and the loop it belongs to. */
  private next = { i: 0, loop: 0 };
  private gen = 0;
  /** start() is waiting for its first segment: pump must not schedule that segment as well. */
  private starting = false;
  private failed = false;
  private lateLogged = -1;

  constructor(
    private readonly ctx: AudioContext,
    private readonly manifest: MixManifest,
    private readonly loader: MixLoader,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = MIX_GAIN;
    this.out.connect(ctx.destination);
  }

  /** AudioContext time at which track time 0 of the current loop sounds, or null when stopped. */
  get anchor(): number | null {
    if (this.anchor0 === null) return null;
    const d = this.manifest.duration;
    const k = Math.max(0, Math.floor((this.ctx.currentTime - this.anchor0) / d));
    return this.anchor0 + k * d;
  }

  /** Index of the segment holding track time `sec`. */
  segmentAt(sec: number): number {
    const segs = this.manifest.segments;
    const at = Math.floor(sec * this.manifest.sampleRate);
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].startSample <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Fetch and decode a segment ahead of time (the first one before the swap is armed). */
  preload(i: number): Promise<AudioBuffer> {
    return this.get(i);
  }

  async start(when: number, trackSec: number): Promise<void> {
    this.stop(0);
    // A stop scheduled for later (the swap bar) that a seek overrides: silence it from `when` on, so
    // the two sessions never play the same music on top of each other.
    const old = this.retired;
    this.retired = null;
    if (old) {
      try {
        const at = Math.max(this.ctx.currentTime, when);
        old.cancelScheduledValues(at);
        old.setValueAtTime(0, at);
      } catch {
        /* already gone */
      }
    }
    const gen = ++this.gen;
    const d = this.manifest.duration;
    const t = ((trackSec % d) + d) % d;
    const session = this.ctx.createGain();
    session.connect(this.out);
    this.session = session;
    this.anchor0 = when - t;
    this.failed = false;
    const i = this.segmentAt(t);
    this.next = { i, loop: 0 };
    this.starting = true;
    this.startDue = when;
    let buf: AudioBuffer;
    try {
      buf = await this.get(i);
    } catch (err) {
      if (gen === this.gen) {
        this.starting = false;
        this.fail(err);
      }
      return;
    }
    if (gen !== this.gen) return;
    this.starting = false;
    this.startDue = null;
    this.schedule(i, 0, buf);
    this.advance();
    void this.get(this.next.i).catch(() => {}); // prefetch the one after
  }

  stop(fadeSec = 0, when?: number): void {
    this.gen++;
    this.starting = false;
    this.startDue = null;
    this.abort.abort();
    this.abort = new AbortController();
    this.pending.clear();
    const session = this.session;
    this.session = null;
    this.anchor0 = null;
    const playing = this.playing;
    this.playing = [];
    if (!session) return;
    const t = Math.max(this.ctx.currentTime, when ?? 0);
    const g = session.gain;
    this.retired = g;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      if (fadeSec > 0) g.linearRampToValueAtTime(0, t + fadeSec);
      else g.setValueAtTime(0, t);
      for (const p of playing) p.src.stop(t + fadeSec + 0.01);
    } catch {
      /* already stopped */
    }
    setTimeout(() => session.disconnect(), Math.max(0, (t - this.ctx.currentTime + fadeSec) * 1000) + 100);
  }

  fade(to: number, sec: number): void {
    const s = this.session;
    if (!s) return;
    const now = this.ctx.currentTime;
    s.gain.cancelScheduledValues(now);
    s.gain.setValueAtTime(s.gain.value, now);
    s.gain.linearRampToValueAtTime(to, now + sec);
  }

  pump(now: number): void {
    if (this.anchor0 === null || this.failed) return;
    if (this.starting) {
      if (this.startDue !== null && now > this.startDue + STALL_SEC) this.fail(new Error('mix segment stalled'));
      return;
    }
    this.playing = this.playing.filter((p) => p.end > now);
    for (let guard = 0; guard < 4; guard++) {
      const { i, loop } = this.next;
      const due = this.whenOf(i, loop);
      if (now < due - SCHEDULE_AHEAD) return;
      const buf = this.buffers.get(i);
      if (!buf) {
        const gen = this.gen;
        void this.get(i).catch((err) => gen === this.gen && this.fail(err));
        if (now > due - 0.05 && this.lateLogged !== i) {
          this.lateLogged = i;
          console.warn(`[cat-rave] mix segment ${i} late (underrun)`);
        }
        if (now > due + STALL_SEC) this.fail(new Error(`mix segment ${i} stalled`));
        return;
      }
      this.schedule(i, loop, buf);
      this.advance();
      void this.get(this.next.i).catch(() => {}); // fetch + decode the next as soon as this one is queued
    }
  }

  /** Drop the decoded segments (~11 MB each); a later start re-decodes them from the HTTP cache. */
  release(): void {
    this.buffers.clear();
  }

  dispose(): void {
    this.stop(0);
    this.buffers.clear();
    try {
      this.out.disconnect();
    } catch {
      /* ignore */
    }
  }

  // -------------------------------------------------------------------------------------------

  private whenOf(i: number, loop: number): number {
    return (this.anchor0 ?? 0) + loop * this.manifest.duration + this.manifest.segments[i].start;
  }

  private advance() {
    const n = this.manifest.segments.length;
    this.next = this.next.i + 1 < n ? { i: this.next.i + 1, loop: this.next.loop } : { i: 0, loop: this.next.loop + 1 };
  }

  /** Start segment i of `loop` at its absolute time; late (seek, underrun) starts part way in. */
  private schedule(i: number, loop: number, buf: AudioBuffer) {
    if (!this.session) return;
    const seg = this.manifest.segments[i];
    const sr = this.manifest.sampleRate;
    const due = this.whenOf(i, loop);
    const earliest = this.ctx.currentTime + 0.02;
    const at = Math.max(due, earliest);
    const into = at - due;
    const length = seg.samples / sr - into;
    if (length <= 0.005) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.session);
    // Duration always explicit: WebKit pads the end of a decoded AAC buffer.
    src.start(at, seg.pre / sr + into, length);
    this.playing.push({ src, end: at + length });
  }

  private get(i: number): Promise<AudioBuffer> {
    const have = this.buffers.get(i);
    if (have) {
      this.buffers.delete(i); // refresh LRU order
      this.buffers.set(i, have);
      return Promise.resolve(have);
    }
    const inflight = this.pending.get(i);
    if (inflight) return inflight;
    const signal = this.abort.signal;
    const p = this.loader
      .segment(i, signal)
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buf) => {
        if (this.pending.get(i) === p) this.pending.delete(i);
        this.buffers.set(i, buf);
        while (this.buffers.size > KEEP_BUFFERS) this.buffers.delete(this.buffers.keys().next().value!);
        return buf;
      });
    p.catch(() => this.pending.get(i) === p && this.pending.delete(i));
    this.pending.set(i, p);
    return p;
  }

  private fail(err: unknown) {
    if (this.failed) return;
    if ((err as { name?: string })?.name === 'AbortError') return;
    this.failed = true;
    this.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
