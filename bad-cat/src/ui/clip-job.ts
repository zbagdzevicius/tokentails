/**
 * Clip export behind the result screen (GDD 7.3): lazy-loads the share lane, plans the clip and exports it
 * on the live renderer. Observable status for the Result and Share screens; retry after an interruption.
 */
import type { AudioEngine, CatSpec, ClipExportResult, ClipPlan, FaceDecal, HouseholdSecond, PlayableRoom, RenderApi, Renderer, RunResult, ShareApi, ShareFormat } from '../types';

/** Post format and clip options picked on the share screen (W2-SHARE). */
export interface ClipOptions {
  format?: ShareFormat;
  /** stitch / reply: the @handle pill. */
  overlay?: string;
  captionStyle?: number;
  music?: boolean;
  endLine?: string;
  adopted?: boolean;
  link?: string;
  /** Household clip: the second cat's run of the same room (and its face), and what to reload afterwards. */
  second?: HouseholdSecond;
  secondFaces?: Map<number, FaceDecal>;
  restore?: { cats: CatSpec[]; faces?: Map<number, FaceDecal> };
}

/** The plain fields as a stable key: the default format is 'pov', empty and false values drop out. */
function plainKey(o: ClipOptions): string {
  const { second: _s, secondFaces: _f, restore: _r, ...plain } = o;
  const norm: Record<string, unknown> = { ...plain, format: plain.format && plain.format !== 'carousel' ? plain.format : 'pov' };
  const keys = Object.keys(norm)
    .filter((k) => norm[k] !== undefined && norm[k] !== false && norm[k] !== '' && norm[k] !== 0)
    .sort();
  return JSON.stringify(keys.map((k) => [k, norm[k]]));
}

/** Option equality: plain fields by value (normalised), the household objects by reference. */
function sameOptions(a: ClipOptions, b: ClipOptions): boolean {
  return a.second === b.second && a.secondFaces === b.secondFaces && a.restore === b.restore && plainKey(a) === plainKey(b);
}

/** Rendered clips kept per option set, so switching back to a format is instant (round 2: 30 s per chip). */
export const CLIP_CACHE_MAX = 6;
import type { ClipView } from './screens/Result';

export interface ClipJobDeps {
  loadShare(): Promise<ShareApi>;
  render: RenderApi;
  renderer: Renderer | null;
  play: PlayableRoom;
  cat: CatSpec;
  result: RunResult;
  audio?: AudioEngine;
  /** Face crop of the opener photo (aligns the match cut). */
  faceCrop?: { x: number; y: number; w: number; h: number } | null;
  opener(): Promise<Blob | undefined>;
  onDone?(r: ClipExportResult, plan: ClipPlan | null): void;
  /** Initial clip options (Club caption style, music toggle). */
  options?: ClipOptions;
}

export interface ClipState extends ClipView {
  blob: Blob | null;
  error?: string;
  plan: ClipPlan | null;
}

export class ClipJob {
  state: ClipState = { status: 'idle', progress: 0, blob: null, plan: null };
  private listeners = new Set<(s: ClipState) => void>();
  private running: Promise<void> | null = null;
  private abort: AbortController | null = null;
  share: ShareApi | null = null;
  private opts: ClipOptions;
  /** Finished clips by option key (household clips are not cached: they hold object references). */
  private cache = new Map<string, { blob: Blob; plan: ClipPlan | null; error?: string }>();

  constructor(private d: ClipJobDeps) {
    this.opts = { ...(d.options ?? {}) };
  }

  /** Current clip options. */
  get options(): ClipOptions {
    return { ...this.opts };
  }

  /**
   * New post format / options: a running export is cancelled and the clip renders again with them.
   * Returns false when nothing changed.
   */
  async setOptions(o: ClipOptions): Promise<boolean> {
    const next = { ...this.opts, ...o };
    if (sameOptions(next, this.opts)) return false;
    this.opts = next;
    if (this.running) await this.cancel();
    const hit = this.cacheable(next) ? this.cache.get(plainKey(next)) : undefined;
    if (hit) {
      this.set({ status: 'ready', progress: 1, blob: hit.blob, plan: hit.plan, error: hit.error });
      return true;
    }
    this.set({ status: 'idle', progress: 0, blob: null, error: undefined });
    void this.start();
    return true;
  }

  private cacheable(o: ClipOptions): boolean {
    return o.format !== 'household' && !o.second;
  }

  private remember(o: ClipOptions, blob: Blob, plan: ClipPlan | null, error?: string): void {
    if (!this.cacheable(o)) return;
    const key = plainKey(o);
    this.cache.delete(key);
    this.cache.set(key, { blob, plan, ...(error ? { error } : {}) });
    while (this.cache.size > CLIP_CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
  }

  subscribe(fn: (s: ClipState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(p: Partial<ClipState>): void {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l(this.state);
  }

  /** True while an export holds the renderer (the stage must not resize it). */
  get busy(): boolean {
    return this.running !== null;
  }

  /** Settles when the current export is finished (the renderer is free again). */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  /**
   * Stop a running export (the player left for a new run): the clip pass hands the renderer, its size and the live
   * camera back after the current frame, and the job returns to idle (it can start again later).
   */
  cancel(): Promise<void> {
    this.abort?.abort();
    return this.idle();
  }

  start(): Promise<void> {
    if (this.running) return this.running;
    if (this.state.status === 'ready') return Promise.resolve();
    this.running = this.run().finally(() => {
      this.running = null;
      this.abort = null;
    });
    return this.running;
  }

  private async run(): Promise<void> {
    const renderer = this.d.renderer;
    if (!renderer) {
      this.set({ status: 'unavailable', progress: 0 });
      return;
    }
    this.set({ status: 'rendering', progress: 0, error: undefined });
    let plan: ClipPlan | null = null;
    const abort = (this.abort = typeof AbortController !== 'undefined' ? new AbortController() : null);
    try {
      const share = this.share ?? (this.share = await this.d.loadShare());
      plan = share.planClip(this.d.result, this.d.play, this.d.cat.name);
      const opener = await this.d.opener().catch(() => undefined);
      const o = this.opts;
      const r = await share.exportClip(this.d.render, renderer, this.d.play, this.d.cat, this.d.result, {
        opener,
        music: !!o.music,
        ...(o.format && o.format !== 'pov' && o.format !== 'carousel' ? { format: o.format } : {}),
        ...(o.overlay ? { overlay: o.overlay } : {}),
        ...(o.captionStyle ? { captionStyle: o.captionStyle } : {}),
        ...(o.endLine ? { endLine: o.endLine } : {}),
        ...(o.adopted ? { adopted: true } : {}),
        ...(o.link ? { link: o.link } : {}),
        ...(o.format === 'household' && o.second ? { second: o.second } : {}),
        ...(o.format === 'household' && o.secondFaces ? { secondFaces: o.secondFaces } : {}),
        ...(o.restore ? { restore: o.restore } : {}),
        audio: this.d.audio,
        faceCrop: this.d.faceCrop ?? null,
        signal: abort?.signal,
        onProgress: (p) => {
          if (!abort?.signal.aborted) this.set({ progress: Math.max(0, Math.min(1, p)) });
        },
      });
      if (abort?.signal.aborted) {
        this.set({ status: 'idle', progress: 0, error: undefined, plan });
        return;
      }
      this.d.onDone?.(r, plan);
      if (r.blob && !r.error) {
        this.remember(o, r.blob, plan);
        this.set({ status: 'ready', progress: 1, blob: r.blob, plan });
      }
      // fallback 2 (no encoder at all): the 2 s GIF of the crash (or the crash card) is what gets posted
      else if (r.gif || r.card) this.set({ status: 'ready', progress: 1, blob: (r.gif ?? r.card)!, plan, error: r.error });
      else this.set({ status: 'error', progress: 0, error: r.error ?? 'no clip', plan });
    } catch (err) {
      if (abort?.signal.aborted) {
        this.set({ status: 'idle', progress: 0, error: undefined, plan });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.d.onDone?.({ blob: null, mime: '', encoder: 'fallback', audio: false, ms: 0, error: msg }, plan);
      this.set({ status: 'error', progress: 0, error: msg, plan });
    }
  }
}
