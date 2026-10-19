// Copied from bad-cat/src/editor/history.ts at 735cbeec (copy, never import).
/** Undo/redo for the Room Maker (GDD 6.4: 20 steps). States are immutable snapshots. */

export const HISTORY_LIMIT = 20;

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private readonly limit = HISTORY_LIMIT) {}

  /** Record the state before a change. Clears redo. Keeps the newest `limit` steps. */
  commit(before: T): void {
    this.past.push(before);
    if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit);
    this.future = [];
  }

  /** The state to go back to (current goes to redo), null when there is nothing to undo. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit);
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get undoDepth(): number {
    return this.past.length;
  }
  clear(): void {
    this.past = [];
    this.future = [];
  }
}
