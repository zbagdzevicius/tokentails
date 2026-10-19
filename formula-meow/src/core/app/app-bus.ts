/**
 * App bus (iteration 2 contract, integrator-owned): typed meta events between lanes, separate from the race's
 * JuiceBus (which carries sim events every frame). Modes, progression and audio-ui talk through this; nobody imports
 * another lane's internals. Listeners that throw are logged once and never break the emitter.
 */
import type { RaceClass, RaceMode, RaceResult, RaceStats } from '../../types';
import type { ScreenId } from './screens';

export interface AppEvents {
  screen: { id: ScreenId | null; prev: ScreenId | null };
  raceStart: { mode: RaceMode; trackId: string; cls: RaceClass; cupId?: string; raceIndex?: number };
  raceEnd: { result: RaceResult; stats: RaceStats[]; mode: RaceMode };
  cupEnd: { cupId: string; cls: RaceClass; place: number; points: number };
  unlock: { kind: string; id: string };
  achievement: { id: string };
  fishEarned: { amount: number; reasons: Array<{ label: string; amount: number }> };
  purchase: { kind: string; id: string; cost: number };
  settingsChanged: { key: string };
}

export type AppEventType = keyof AppEvents;
type Fn<K extends AppEventType> = (e: AppEvents[K]) => void;

export class AppBus {
  private map = new Map<AppEventType, Array<Fn<AppEventType>>>();
  private failed = new WeakSet<object>();

  on<K extends AppEventType>(type: K, fn: Fn<K>): () => void {
    const list = this.map.get(type) ?? [];
    list.push(fn as Fn<AppEventType>);
    this.map.set(type, list);
    return () => {
      const l = this.map.get(type);
      if (l) this.map.set(type, l.filter((x) => x !== fn));
    };
  }

  emit<K extends AppEventType>(type: K, e: AppEvents[K]): void {
    for (const fn of this.map.get(type)?.slice() ?? []) {
      try {
        (fn as Fn<K>)(e);
      } catch (err) {
        if (!this.failed.has(fn)) {
          this.failed.add(fn);
          console.warn(`[app-bus] a "${type}" listener failed`, err);
        }
      }
    }
  }
}

export const appBus = new AppBus();
