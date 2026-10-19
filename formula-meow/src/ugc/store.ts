/**
 * Saved tracks on this device (GDD 6.4). Stored as share codes (about 130 chars each), newest first, through the
 * core's guarded localStorage wrapper. Nothing leaves the device until the player shares a link.
 */
import type { TrackDef } from '../types';
import { load, save } from '../core/app/storage';

export interface SavedTrack {
  /** local slot id: edits of the same draft overwrite it */
  slot: string;
  code: string;
  name: string;
  /** ms since epoch (UI only) */
  at: number;
}

const KEY = 'ugc-tracks';
const DRAFT = 'ugc-draft';
const ME = 'ugc-me';
export const MAX_SAVED = 40;

export function listSaved(): SavedTrack[] {
  const v = load<{ list: SavedTrack[] }>(KEY, { list: [] });
  return Array.isArray(v.list) ? v.list.filter((s) => s && typeof s.code === 'string' && typeof s.slot === 'string') : [];
}

export function putSaved(entry: SavedTrack): SavedTrack[] {
  const list = [entry, ...listSaved().filter((s) => s.slot !== entry.slot)].slice(0, MAX_SAVED);
  save(KEY, { list });
  return list;
}

export function removeSaved(slot: string): SavedTrack[] {
  const list = listSaved().filter((s) => s.slot !== slot);
  save(KEY, { list });
  return list;
}

export function newSlot(): string {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/** The draft in progress (survives a reload). Raw TrackDef: drafts may not be valid yet. */
export interface Draft {
  slot: string;
  def: TrackDef;
}

export function loadDraft(): Draft | null {
  const v = load<{ draft: Draft | null }>(DRAFT, { draft: null });
  const d = v.draft;
  if (!d || !d.def || !Array.isArray(d.def.points) || !Array.isArray(d.def.features)) return null;
  return d;
}

export function saveDraft(d: Draft | null): void {
  save(DRAFT, { draft: d });
}

/** The creator tag, remembered (GDD 6.4 step 5). */
export function loadCreator(): string {
  const v = load<{ name: string }>(ME, { name: '' });
  return typeof v.name === 'string' ? v.name : '';
}

export function saveCreator(name: string): void {
  save(ME, { name });
}
