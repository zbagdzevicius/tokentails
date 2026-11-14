/**
 * HIGHLIGHTS.md §1, §5.1: the results strip's scan. The record runs once to the end in a sim Worker (the game's own
 * local-host.worker.ts, an `r:scan` message: no keyframes, so cheaper than the viewer's scout) and the detector's reel
 * comes back in one `r:hl`. Without Workers the same ReplayLoop runs on the main thread in slices. Its own lazy chunk.
 */
import type { HighlightLoad, ReplayRecordLike } from './core';
import type { HighlightReel } from './highlights/rules';
import { ReplayLoop, type ReplayHostMsg } from './loop';

export interface ScanResult {
  reel: HighlightReel | null;
  ms: number;
}

export interface Scan {
  readonly done: Promise<ScanResult>;
  cancel(): void;
}

/** Scan `record` for highlights. Never rejects: a failure is `{ reel: null }`. */
export function scanReel(record: ReplayRecordLike, hl: HighlightLoad, o: { worker?: boolean } = {}): Scan {
  let resolve!: (r: ScanResult) => void;
  const done = new Promise<ScanResult>((r) => (resolve = r));
  let settled = false;
  let close = (): void => undefined;
  const t0 = performance.now();
  const finish = (r: ScanResult): void => {
    if (settled) return;
    settled = true;
    close();
    resolve(r);
  };
  const onMsg = (m: unknown): void => {
    const msg = m as ReplayHostMsg | { t: 'error' };
    if (msg?.t === 'r:hl') finish({ reel: msg.reel, ms: msg.ms || Math.round(performance.now() - t0) });
    else if (msg?.t === 'error') finish({ reel: null, ms: Math.round(performance.now() - t0) });
  };
  const inline = (): void => {
    const loop = new ReplayLoop({
      now: () => performance.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      post: onMsg,
    });
    close = () => loop.handle({ t: 'r:leave' });
    try {
      loop.handle({ t: 'r:scan', record, hl });
    } catch {
      finish({ reel: null, ms: 0 });
    }
  };
  let started = false;
  if (o.worker !== false && typeof Worker !== 'undefined') {
    try {
      const w = new Worker(new URL('../host/local-host.worker.ts', import.meta.url), { type: 'module', name: 'pawlegends-sim' });
      w.addEventListener('message', (e) => onMsg(e.data));
      w.addEventListener('error', (e) => {
        e.preventDefault?.();
        // the Worker never loaded: the main thread scans instead
        if (settled) return;
        w.terminate();
        inline();
      });
      close = () => w.terminate();
      w.postMessage({ t: 'r:scan', record, hl });
      started = true;
    } catch {
      started = false;
    }
  }
  if (!started) inline();
  return {
    done,
    cancel: () => finish({ reel: null, ms: Math.round(performance.now() - t0) }),
  };
}
