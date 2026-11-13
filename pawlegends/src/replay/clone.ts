/**
 * Replay keyframes (docs/plans/moba/MATCH-MOMENTS.md §2): a deep copy of a running match that keeps every class
 * prototype (the sim's Rng and friends), shared references and cycles, so a copy steps exactly like the original.
 * Read-only towards the sim: it never imports or changes sim code. Functions are kept by reference (the sim's state
 * holds none, but a copy must never crash on one).
 */
export function deepClone<T>(value: T): T {
  const seen = new Map<object, unknown>();
  const copy = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    const hit = seen.get(v as object);
    if (hit !== undefined) return hit;
    if (ArrayBuffer.isView(v)) {
      if (v instanceof DataView) {
        const d = new DataView(v.buffer.slice(0));
        seen.set(v, d);
        return d;
      }
      const t = (v as unknown as { slice(): unknown }).slice();
      seen.set(v, t);
      return t;
    }
    if (v instanceof ArrayBuffer) {
      const b = v.slice(0);
      seen.set(v, b);
      return b;
    }
    if (Array.isArray(v)) {
      const a: unknown[] = new Array(v.length);
      seen.set(v, a);
      for (let i = 0; i < v.length; i++) a[i] = copy(v[i]);
      return a;
    }
    if (v instanceof Map) {
      const m = new Map();
      seen.set(v, m);
      for (const [k, x] of v) m.set(copy(k), copy(x));
      return m;
    }
    if (v instanceof Set) {
      const s = new Set();
      seen.set(v, s);
      for (const x of v) s.add(copy(x));
      return s;
    }
    const o = Object.create(Object.getPrototypeOf(v)) as Record<string, unknown>;
    seen.set(v as object, o);
    for (const k of Object.keys(v as object)) o[k] = copy((v as Record<string, unknown>)[k]);
    return o;
  };
  return copy(value) as T;
}
