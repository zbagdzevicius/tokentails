// Pure: the rolling replay buffer. Each entry is one standalone recorded segment (a playable file) with its start and
// end on the capture clock (seconds of recorded time; pauses do not count).
export interface Sized {
  size: number;
}
export interface RingSegment<B extends Sized = Blob> {
  blob: B;
  t0: number;
  t1: number;
}
export interface Covering<B extends Sized = Blob> {
  /** oldest first */
  segments: RingSegment<B>[];
  /** seconds to skip at the start of segments[0] */
  offset: number;
  /** seconds of footage from the offset to the end of the newest segment */
  seconds: number;
}

export const RING_MAX_SEGMENTS = 3;
export const RING_MAX_BYTES = 40 * 1024 * 1024;

export class SegmentRing<B extends Sized = Blob> {
  private list: RingSegment<B>[] = [];
  constructor(
    readonly maxSegments = RING_MAX_SEGMENTS,
    readonly maxBytes = RING_MAX_BYTES,
  ) {}

  /** Add the newest segment; the oldest go once there are more than maxSegments or maxBytes (the newest always stays). */
  push(seg: RingSegment<B>): void {
    if (!seg || !(seg.t1 > seg.t0) || !Number.isFinite(seg.t0) || !Number.isFinite(seg.t1)) return;
    this.list.push(seg);
    while (this.list.length > 1 && (this.list.length > this.maxSegments || this.bytes > this.maxBytes)) this.list.shift();
  }

  get bytes(): number {
    let n = 0;
    for (const s of this.list) n += s.blob.size;
    return n;
  }
  get length(): number {
    return this.list.length;
  }
  /** seconds of footage held */
  get seconds(): number {
    let n = 0;
    for (const s of this.list) n += s.t1 - s.t0;
    return n;
  }
  /** newest last */
  get segments(): readonly RingSegment<B>[] {
    return this.list;
  }
  newest(): RingSegment<B> | null {
    return this.list[this.list.length - 1] ?? null;
  }
  clear(): void {
    this.list = [];
  }

  /**
   * The newest segments that cover the last `seconds` before `now` (default: the newest segment's end), plus the
   * offset into the first one. Holding less than `seconds` returns everything (offset 0). null = empty.
   */
  covering(seconds: number, now?: number): Covering<B> | null {
    const n = this.list.length;
    if (!n) return null;
    const end = now ?? this.list[n - 1].t1;
    const start = end - Math.max(0, seconds);
    let i = n - 1;
    while (i > 0 && this.list[i].t0 > start) i--;
    const segments = this.list.slice(i);
    const first = segments[0];
    const offset = Math.max(0, Math.min(first.t1 - first.t0, start - first.t0));
    let total = 0;
    for (const s of segments) total += s.t1 - s.t0;
    return { segments, offset, seconds: Math.max(0, total - offset) };
  }
}
