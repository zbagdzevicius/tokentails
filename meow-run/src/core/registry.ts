// Registries the lanes fill from their register*() functions. FROZEN.
import type { ActorDef, KittenRig, SetPieceType, StageDef, StageId, ThemeDef, ThemeId } from './types';

export class Registry<K extends string, T extends { id: K }> {
  private map = new Map<K, T>();
  constructor(readonly kind: string) {}
  /** Register or replace (a lane may swap a placeholder for the real thing). */
  add(item: T): T {
    this.map.set(item.id, item);
    return item;
  }
  get(id: K): T {
    const v = this.map.get(id);
    if (!v) throw new Error(`${this.kind} not registered: ${id}`);
    return v;
  }
  has(id: K): boolean {
    return this.map.has(id);
  }
  all(): T[] {
    return [...this.map.values()];
  }
}

export const stages = new Registry<StageId, StageDef>('stage');
export const themes = new Registry<ThemeId, ThemeDef>('theme');
export const setPieceTypes = new Registry<string, SetPieceType>('set piece');
/** dog, cloud, leaf, grandma ... (cat-audio lane); set pieces build them with actors.get(id).build() */
export const actors = new Registry<string, ActorDef>('actor');

/** Stages in menu order. */
export function stageList(): StageDef[] {
  return stages.all().sort((a, b) => a.index - b.index);
}

let kittenBuilder: (() => KittenRig) | null = null;
/** cat-audio lane: the player's model. Core builds one per stage start. */
export function registerKitten(build: () => KittenRig): void {
  kittenBuilder = build;
}
export const kittenFactory = () => kittenBuilder;
