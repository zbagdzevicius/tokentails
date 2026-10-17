/**
 * `?perf=1`: a small on-screen readout for the device gate (POC.md §15 item 27, README "Device performance results"):
 * frames a second, p95 frame time (the last ~2 s and the whole match so far), draw calls (now and the match peak),
 * JS heap where the browser reports it (Chromium's `performance.memory`; Safari has none), and the quality tier.
 * The founder plays a full match on the phone and copies the numbers off the screen at the end.
 *
 * Opt-in only, off by default, and not a debug hook: nothing is put on `window`, it reads only what the game already
 * has (frame times, `renderer.info`), and it adds a DOM node only when the URL asks for it.
 */
export function perfFromUrl(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  try {
    return new URLSearchParams(search).get('perf') === '1';
  } catch {
    return false;
  }
}

/** p95 of `xs[0..n)` (ms, one decimal). */
export function p95Of(xs: ArrayLike<number>, n: number = xs.length): number {
  if (n <= 0) return 0;
  const s = Array.from({ length: n }, (_, i) => xs[i]).sort((a, b) => a - b);
  return Math.round(s[Math.min(n - 1, Math.floor(n * 0.95))] * 10) / 10;
}

const RECENT = 120;
const MATCH_CAP = 40000;
/** DOM refresh interval (ms): twice a second, so the readout itself costs nothing measurable. */
const PAINT_MS = 500;

export interface PerfSample {
  /** Wall time since the last frame (ms). */
  frameMs: number;
  draws: number;
  tier: string;
  inMatch: boolean;
}

export class PerfReadout {
  readonly el: HTMLElement;
  private recent = new Float32Array(RECENT);
  private recentN = 0;
  private recentAt = 0;
  private match = new Float32Array(MATCH_CAP);
  private matchN = 0;
  private wasInMatch = false;
  private peakDraws = 0;
  private peakHeap = 0;
  private sinceFps = 0;
  private framesFps = 0;
  private fps = 0;
  private sincePaint = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'pl-perf';
    this.el.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.el);
  }

  sample(s: PerfSample): void {
    if (s.inMatch && !this.wasInMatch) {
      this.matchN = 0;
      this.peakDraws = 0;
      this.peakHeap = 0;
    }
    this.wasInMatch = s.inMatch;
    this.recent[this.recentAt] = s.frameMs;
    this.recentAt = (this.recentAt + 1) % RECENT;
    this.recentN = Math.min(RECENT, this.recentN + 1);
    if (s.inMatch && this.matchN < MATCH_CAP) this.match[this.matchN++] = s.frameMs;
    if (s.inMatch) this.peakDraws = Math.max(this.peakDraws, s.draws);
    this.framesFps++;
    this.sinceFps += s.frameMs;
    if (this.sinceFps >= 1000) {
      this.fps = Math.round((1000 * this.framesFps) / this.sinceFps);
      this.framesFps = 0;
      this.sinceFps = 0;
    }
    this.sincePaint += s.frameMs;
    if (this.sincePaint < PAINT_MS) return;
    this.sincePaint = 0;
    const heap = heapMb();
    if (heap !== null && s.inMatch) this.peakHeap = Math.max(this.peakHeap, heap);
    const lines = [
      `${this.fps} fps · ${s.tier}`,
      `p95 ${p95Of(this.recent, this.recentN).toFixed(1)} ms` + (this.matchN > 0 ? ` · match ${p95Of(this.match, this.matchN).toFixed(1)}` : ''),
      `draws ${s.draws}` + (this.peakDraws > 0 ? ` · max ${this.peakDraws}` : ''),
      heap === null ? 'heap n/a' : `heap ${heap.toFixed(0)} MB` + (this.peakHeap > 0 ? ` · max ${this.peakHeap.toFixed(0)}` : ''),
    ];
    this.el.textContent = lines.join('\n');
  }

  dispose(): void {
    this.el.remove();
  }
}

function heapMb(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  return m && typeof m.usedJSHeapSize === 'number' && m.usedJSHeapSize > 0 ? m.usedJSHeapSize / 1048576 : null;
}
