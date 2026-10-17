/**
 * Founder studio session (GDD 6.2, `?studio=1`, M1a): a queue of {photo, handle, name} goes through
 * crop -> name -> 40 s practice -> render with the handle overlay -> save, one cat after another (batch mode).
 * Pure reducer: no DOM, no timers. The UI (W3) drives it and owns the photos (Blobs) and the clip blobs.
 * Target: <= 2 minutes of founder time per clip.
 */
import { filterName } from '../codec';
import type { ShareFormat } from '../types';
import { FORMAT_HOOKS, normalizeHandle } from './clip/format-plan';

export const STUDIO_STEPS = ['crop', 'name', 'practice', 'render', 'save'] as const;
export type StudioStep = (typeof STUDIO_STEPS)[number] | 'done';
export const STUDIO_PRACTICE_SECONDS = 40;
export const STUDIO_MAX_QUEUE = 50;

export interface StudioItemInput<P = Blob> {
  photo: P;
  handle?: string;
  name?: string;
  /** stitch (owner of a viral video) or reply (a commenter); default stitch. */
  format?: Extract<ShareFormat, 'stitch' | 'reply'>;
}

export interface StudioItem<P = Blob> {
  id: number;
  photo: P;
  handle: string;
  name: string;
  format: 'stitch' | 'reply';
  step: StudioStep;
  crop?: { x: number; y: number; w: number; h: number };
  /** Practice run done (the UI keeps the RunResult). */
  runId?: string;
  /** Rendered clip key (the UI keeps the blob). */
  clipId?: string;
  saved: boolean;
  skipped: boolean;
  error?: string;
}

export interface StudioState<P = Blob> {
  items: StudioItem<P>[];
  /** Index of the item being worked on; items.length = queue finished. */
  current: number;
  nextId: number;
  /** Batch mode: after save, move to the next item automatically. */
  batch: boolean;
}

export type StudioAction<P = Blob> =
  | { type: 'add'; items: StudioItemInput<P>[] }
  | { type: 'crop'; crop: { x: number; y: number; w: number; h: number } }
  | { type: 'name'; name: string; handle?: string }
  | { type: 'practiced'; runId: string }
  | { type: 'rendered'; clipId: string }
  | { type: 'render_failed'; error: string }
  | { type: 'saved' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'select'; index: number }
  | { type: 'remove'; index: number }
  | { type: 'set_batch'; batch: boolean };

export function createStudio<P = Blob>(items: StudioItemInput<P>[] = [], batch = true): StudioState<P> {
  return studioReducer<P>({ items: [], current: 0, nextId: 1, batch }, { type: 'add', items });
}

function cleanName(raw: string | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  try {
    return filterName(s, 12);
  } catch {
    return s.slice(0, 12);
  }
}

function patch<P>(s: StudioState<P>, p: Partial<StudioItem<P>>): StudioState<P> {
  const it = s.items[s.current];
  if (!it) return s;
  const items = s.items.slice();
  items[s.current] = { ...it, ...p };
  return { ...s, items };
}

/** The next unfinished item at or after `from`, else items.length. */
function nextOpen<P>(items: readonly StudioItem<P>[], from: number): number {
  for (let i = Math.max(0, from); i < items.length; i++) if (items[i].step !== 'done') return i;
  return items.length;
}

export function studioReducer<P = Blob>(s: StudioState<P>, a: StudioAction<P>): StudioState<P> {
  const it = s.items[s.current];
  switch (a.type) {
    case 'add': {
      const room = STUDIO_MAX_QUEUE - s.items.length;
      const add = a.items.slice(0, Math.max(0, room)).map(
        (x, i): StudioItem<P> => ({
          id: s.nextId + i,
          photo: x.photo,
          handle: normalizeHandle(x.handle),
          name: cleanName(x.name),
          format: x.format === 'reply' ? 'reply' : 'stitch',
          step: 'crop',
          saved: false,
          skipped: false,
        }),
      );
      const items = [...s.items, ...add];
      return { ...s, items, nextId: s.nextId + add.length, current: s.current < s.items.length ? s.current : nextOpen(items, s.current) };
    }
    case 'crop':
      return it && it.step === 'crop' ? patch(s, { crop: a.crop, step: 'name' }) : s;
    case 'name': {
      if (!it || it.step !== 'name') return s;
      const name = cleanName(a.name);
      if (!name) return s;
      return patch(s, { name, handle: a.handle !== undefined ? normalizeHandle(a.handle) : it.handle, step: 'practice' });
    }
    case 'practiced':
      return it && it.step === 'practice' ? patch(s, { runId: a.runId, step: 'render', error: undefined }) : s;
    case 'rendered':
      return it && it.step === 'render' ? patch(s, { clipId: a.clipId, step: 'save', error: undefined }) : s;
    case 'render_failed':
      return it && it.step === 'render' ? patch(s, { error: a.error }) : s;
    case 'saved': {
      if (!it || it.step !== 'save') return s;
      const done = patch(s, { saved: true, step: 'done' });
      return s.batch ? { ...done, current: nextOpen(done.items, s.current + 1) } : done;
    }
    case 'back': {
      if (!it || it.step === 'done') return s;
      const i = STUDIO_STEPS.indexOf(it.step as (typeof STUDIO_STEPS)[number]);
      return i > 0 ? patch(s, { step: STUDIO_STEPS[i - 1], error: undefined }) : s;
    }
    case 'skip': {
      if (!it) return s;
      const done = patch(s, { skipped: true, step: 'done' });
      return { ...done, current: nextOpen(done.items, s.current + 1) };
    }
    case 'select':
      return a.index >= 0 && a.index < s.items.length ? { ...s, current: a.index } : s;
    case 'remove': {
      if (a.index < 0 || a.index >= s.items.length) return s;
      const items = s.items.filter((_, i) => i !== a.index);
      const current = a.index < s.current ? s.current - 1 : Math.min(s.current, items.length);
      return { ...s, items, current: items[current]?.step === 'done' ? nextOpen(items, current) : current };
    }
    case 'set_batch':
      return { ...s, batch: a.batch };
    default:
      return s;
  }
}

/** The item being worked on, or null when the queue is finished. */
export function studioCurrent<P>(s: StudioState<P>): StudioItem<P> | null {
  return s.items[s.current] ?? null;
}

/** Progress for the studio header: "3 / 10 saved". */
export function studioProgress<P>(s: StudioState<P>): { saved: number; skipped: number; total: number; finished: boolean } {
  let saved = 0;
  let skipped = 0;
  for (const i of s.items) {
    if (i.saved) saved++;
    if (i.skipped) skipped++;
  }
  return { saved, skipped, total: s.items.length, finished: s.current >= s.items.length };
}

/** exportClip options for the current item's render step (stitch/reply format + its handle). */
export function studioExportOptions<P>(it: StudioItem<P>): { format: 'stitch' | 'reply'; overlay?: string } {
  return { format: it.format, overlay: it.handle || undefined };
}

/** Burned-in hook of the item ("I put @luna.mom's cat in my game"). */
export function studioHook<P>(it: StudioItem<P>): string {
  return it.format === 'reply' ? FORMAT_HOOKS.reply(it.name || 'your cat') : FORMAT_HOOKS.stitch(it.handle);
}

/** File name for the saved clip: "badcat-luna.mom-mochi.mp4". */
export function studioFileName<P>(it: StudioItem<P>, ext = 'mp4'): string {
  const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9._]+/g, '-').replace(/^-+|-+$/g, '');
  return ['badcat', slug(it.handle), slug(it.name)].filter(Boolean).join('-') + `.${ext}`;
}

/**
 * Batch list: one line per cat, "handle, name" or "@handle name" (paste from notes). Photos are attached by order.
 * Pure parser; empty lines are skipped.
 */
export function parseStudioBatch(text: string): { handle: string; name: string; format: 'stitch' | 'reply' }[] {
  const out: { handle: string; name: string; format: 'stitch' | 'reply' }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const reply = /^(r|reply)\s*[:|]\s*/i.test(line);
    const body = line.replace(/^(r|reply|s|stitch)\s*[:|]\s*/i, '');
    const parts = body.split(/\s*[,;\t]\s*|\s+/).filter(Boolean);
    const handle = normalizeHandle(parts[0] ?? '');
    const name = cleanName(parts.slice(1).join(' '));
    out.push({ handle, name, format: reply ? 'reply' : 'stitch' });
  }
  return out;
}

/** Does the link ask for the studio (`?studio=1`)? Honoured in every build; admin routes stay role-checked on the server. */
export function studioEnabled(search: string): boolean {
  return /(^|[?&])studio=1(&|$)/.test(search);
}
