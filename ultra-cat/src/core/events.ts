// Typed game event bus. FROZEN. Emitters are listed next to each event; any lane may listen.
import type { CatDef, EnemyId, LevelDef, RunResult } from './types';

export interface GameEvents {
  levelLoad: { level: LevelDef; cat: CatDef }; // session.prepareLevel (city rebuilt, mode 'title')
  levelStart: { level: LevelDef; cat: CatDef }; // session.beginPlay (mode -> 'play')
  levelEnd: { result: RunResult }; // session.endLevel, mode -> 'over'
  pause: Record<string, never>;
  resume: Record<string, never>;
  damage: { amount: number; label: string; x: number; y: number; z: number }; // core score()
  comboHit: { combo: number };
  buildingWrecked: { index: number; total: number };
  landmarkToppled: { index: number; count: number; bonus: number };
  wantedPicked: { index: number };
  enemyKilled: { type: EnemyId; boss: boolean; x: number; y: number; z: number; count: number }; // core reportKill()
  heliSwatted: { count: number }; // core reportKill() when type === 'heli'
  bossSpawn: { type: EnemyId; name: string; maxHp: number }; // boss types
  bossHp: { type: EnemyId; hp: number; maxHp: number }; // boss types, on every hit
  bossPhase: { type: EnemyId; phase: number; name: string }; // boss types
  bossDefeated: { type: EnemyId }; // core reportKill() with boss flag
  patienceHit: { amount: number; source: string }; // core soak()
  startled: { seconds: number; source: string }; // core startle()
  fishEaten: { count: number };
  swat: { x: number; z: number; hit: boolean };
  pounce: Record<string, never>;
  pounceLand: { x: number; z: number; money: number };
  zoomies: { on: boolean };
  moved: { distance: number }; // once per second of walking (tutorial)
  ultraReady: Record<string, never>;
  ultraStart: { ability: string };
  ultraEnd: { ability: string; tally: number };
  frenzy: Record<string, never>;
  bigHit: { strength: number }; // 0..1+, music ducking and juice (crash, boom, landing)
}

type Handler<K extends keyof GameEvents> = (e: GameEvents[K]) => void;

class Bus {
  private h: { [K in keyof GameEvents]?: Handler<K>[] } = {};
  on<K extends keyof GameEvents>(k: K, fn: Handler<K>): () => void {
    const list = (this.h[k] ??= []) as Handler<K>[];
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }
  emit<K extends keyof GameEvents>(k: K, e: GameEvents[K]): void {
    const list = this.h[k] as Handler<K>[] | undefined;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](e);
      } catch (err) {
        console.error(`event ${k} handler failed`, err);
      }
    }
  }
}

export const events = new Bus();
export const EMPTY = Object.freeze({}) as Record<string, never>;
