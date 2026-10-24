// Shared spawn rules for every enemy type (pure: no three, no DOM, node-importable for tests).
// From an EnemySpec: the first spawn at `delay` s of G.elapsed, then every max(minEvery, every - elapsed/10*everyRamp),
// with at most max + floor(elapsed/maxRamp) alive (maxRamp 0 = no growth). No spawning while blocked
// (not playing, tutorial time freeze, final frenzy).

export interface SpawnSpec {
  delay: number;
  every: number;
  minEvery: number;
  everyRamp: number;
  max: number;
  maxRamp: number;
  params?: Record<string, number>;
}

/** Seconds between spawns at `elapsed` seconds of play. */
export function spawnInterval(s: SpawnSpec, elapsed: number): number {
  return Math.max(s.minEvery, s.every - (Math.max(0, elapsed) / 10) * s.everyRamp);
}

/** How many may be alive at once at `elapsed` seconds of play. */
export function maxAlive(s: SpawnSpec, elapsed: number): number {
  return s.max + (s.maxRamp > 0 ? Math.floor(Math.max(0, elapsed) / s.maxRamp) : 0);
}

/** A type-specific tuning value from spec.params, else the default. */
export function param(s: SpawnSpec | null | undefined, key: string, d: number): number {
  const v = s?.params?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/**
 * One spawner per enemy type. Call tick() every frame; spawn one instance whenever it returns true.
 * `next` is the G.elapsed time of the next allowed spawn.
 */
export class Spawner {
  spec: SpawnSpec | null = null;
  next = Infinity;

  reset(spec: SpawnSpec | null): void {
    this.spec = spec;
    this.next = spec ? spec.delay : Infinity;
  }

  /** True when an instance should spawn now. `alive` = instances currently alive. */
  tick(elapsed: number, alive: number, blocked: boolean): boolean {
    const s = this.spec;
    if (!s || blocked || elapsed < this.next) return false;
    if (alive >= maxAlive(s, elapsed)) return false; // wait for a free slot, spawn as soon as one opens
    this.next = elapsed + spawnInterval(s, elapsed);
    return true;
  }
}
