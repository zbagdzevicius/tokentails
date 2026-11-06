/**
 * Hidden tab and app pause for party play (MULTIPLAYER.md §4.5): `visibilitychange` and, in the Capacitor app, the
 * App plugin's `pause` / `resume`. On hide the client sends `away` at once (the relay pilots the slot) and stops
 * stepping; on show it syncs, fast-forwards and sends `back`.
 */
export interface VisibilityHooks {
  hidden(): void;
  visible(): void;
}

interface CapApp {
  addListener(event: 'pause' | 'resume', fn: () => void): Promise<{ remove(): void }> | { remove(): void };
}

export function watchVisibility(h: VisibilityHooks, doc: Document = document): () => void {
  const onVis = () => (doc.visibilityState === 'hidden' ? h.hidden() : h.visible());
  doc.addEventListener('visibilitychange', onVis);
  const removers: (() => void)[] = [() => doc.removeEventListener('visibilitychange', onVis)];
  try {
    const app = (globalThis as { Capacitor?: { Plugins?: { App?: CapApp } } }).Capacitor?.Plugins?.App;
    if (app) {
      for (const [ev, fn] of [
        ['pause', h.hidden],
        ['resume', h.visible],
      ] as const) {
        const r = app.addListener(ev, fn);
        void Promise.resolve(r).then((x) => removers.push(() => x.remove()));
      }
    }
  } catch {
    /* no Capacitor */
  }
  return () => removers.forEach((r) => r());
}
