/**
 * NPC batches for Shelter and Home (plan G13 step 6, F10).
 *
 * `planNpcBatch` is the pure part: which cats of a batch get a sprite, under which id key, and
 * which are skipped before any request (no id to key on, no usable sprite URL, a duplicate, or
 * already on screen). `NpcSpawnCoalescer` turns the legacy one-cat-per-event NPC_SPAWN stream
 * into one batch per task, so the old producer gets the same single load pass.
 *
 * No Phaser import (Jest).
 */
import { isLoadableSpriteUrl, npcTextureKey } from "@/components/Phaser/look/textureKeys";

export interface NpcEntry<C, T> {
  npc: C;
  type: T;
}

interface NpcLike {
  _id?: string | null;
  name?: string | null;
  spriteImg?: string | null;
  blessing?: unknown;
  type?: unknown;
}

export interface PlannedNpc<C, T> extends NpcEntry<C, T> {
  id: string;
  textureKey: string;
}

export interface NpcBatchPlan<C, T> {
  spawn: PlannedNpc<C, T>[];
  /** Ids (or `unknown`) of cats that were dropped before loading. */
  skippedIds: string[];
  /** Entries that were already on screen or repeated; not counted as skipped. */
  duplicates: number;
}

export const UNKNOWN_NPC_ID = "unknown";

export function planNpcBatch<C extends NpcLike, T>(
  entries: readonly (NpcEntry<C, T> | null | undefined)[] | null | undefined,
  onScreenIds: ReadonlySet<string> = new Set(),
): NpcBatchPlan<C, T> {
  const spawn: PlannedNpc<C, T>[] = [];
  const skippedIds: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const npc = entry?.npc;
    const id = typeof npc?._id === "string" ? npc._id.trim() : "";
    if (!entry || !npc || !id) {
      skippedIds.push(id || UNKNOWN_NPC_ID);
      return;
    }
    if (seen.has(id) || onScreenIds.has(id)) {
      duplicates += 1;
      return;
    }
    seen.add(id);
    if (!isLoadableSpriteUrl(npc.spriteImg)) {
      skippedIds.push(id);
      return;
    }
    spawn.push({ ...entry, id, textureKey: npcTextureKey(npc) });
  });

  return { spawn, skippedIds, duplicates };
}

/** Blessing sheets a batch needs, one per ability type. */
export function blessingTypes<C extends NpcLike, T>(planned: readonly PlannedNpc<C, T>[]): string[] {
  const types = new Set<string>();
  planned.forEach(({ npc }) => {
    if (npc.blessing && typeof npc.type === "string" && npc.type) types.add(npc.type);
  });
  return Array.from(types);
}

/**
 * Collects single NPC_SPAWN events and flushes them together on the next task. Shelter.tsx
 * pushes all its cats synchronously in one effect, so they land in one batch.
 */
export class NpcSpawnCoalescer<E> {
  private entries: E[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly flush: (entries: E[]) => void,
    private readonly delayMs: number = 0,
  ) {}

  push(entry: E): void {
    if (this.disposed) return;
    this.entries.push(entry);
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const batch = this.entries;
      this.entries = [];
      if (!this.disposed && batch.length) this.flush(batch);
    }, this.delayMs);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.entries = [];
  }
}
