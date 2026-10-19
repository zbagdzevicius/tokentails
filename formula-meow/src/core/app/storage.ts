/** localStorage wrapper: every read and write is guarded (private mode, blocked storage, thumbnails). */
const PREFIX = 'fm:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && fallback && typeof fallback === 'object' ? { ...fallback, ...(v as object) } : (v as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings live for this session only */
  }
}
