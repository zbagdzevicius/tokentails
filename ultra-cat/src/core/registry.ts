// Registries the lanes fill from their own index.ts. FROZEN.
import type { CatDef, CatId, EnemyId, EnemyType, LevelDef, LevelId } from './types';

export class Registry<K extends string, T extends { id: K }> {
  private map = new Map<K, T>();
  constructor(readonly kind: string) {}
  /** Register or replace (replacing is allowed so a lane can swap a placeholder for the real thing). */
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

export const levels = new Registry<LevelId, LevelDef>('level');
export const cats = new Registry<CatId, CatDef>('cat');
export const enemyTypes = new Registry<EnemyId, EnemyType>('enemy');

/** Levels in campaign order. */
export function levelList(): LevelDef[] {
  return levels.all().sort((a, b) => a.index - b.index);
}
