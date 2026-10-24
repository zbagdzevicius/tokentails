// Typed game event bus. FROZEN. The emitter is noted next to each event; any lane may listen.
// Audio, juice, HUD and tutorial code should react to these instead of being called directly.
import type { Action, Quality, RunResult, SegmentKind, StageDef } from './types';

export interface GameEvents {
  // ---- session (core/session.ts) ----
  stageLoad: { stage: StageDef }; // track + theme built (title attract or before play)
  stageStart: { stage: StageDef; at: number }; // mode -> 'play'; at = start s
  finishLine: { stage: StageDef }; // crossed the finish line, mode -> 'finish' (kitten runs out ~2 s)
  stageEnd: { result: RunResult }; // mode -> 'over' (finished, endless out of hearts)
  quit: { stage: StageDef }; // back to the title from a run
  pause: Record<string, never>;
  resume: Record<string, never>;
  checkpoint: { index: number; s: number };
  lifeLost: { penalty: number; s: number }; // 0 hearts: score penalty, respawn at the checkpoint
  respawn: { s: number };
  // ---- player (core/player.ts) ----
  action: { action: Action }; // raw input action (tutorial)
  jump: { air: boolean }; // air = jumped off coyote time
  pounce: Record<string, never>; // the double jump / air dash
  land: { impact: number }; // u/s downward speed at touchdown
  slide: { on: boolean };
  fastFall: Record<string, never>;
  surface: { kind: SegmentKind; prev: SegmentKind }; // the surface under the player changed (wall, river, bridge...)
  abilityPress: { consumed: boolean }; // E / tap; consumed = a set piece used it
  abilityStart: { id: string }; // beginArc / beginRide
  abilityEnd: { id: string };
  hit: { label: string; hearts: number };
  fall: { s: number }; // fell into a gap (then hit, unless invulnerable)
  boost: { mul: number; seconds: number }; // FOV kick, speed lines
  wet: { seconds: number }; // puddle: slowed, shake
  // ---- scoring (core/score.ts) ----
  pickup: { kind: string; points: number; x: number; y: number; z: number }; // world position
  bell: { index: number; count: number; total: number };
  mult: { value: number };
  nearMiss: { label: string; points: number };
  meter: { value: number };
  // ---- set pieces ----
  chase: { on: boolean; kind: string }; // dog, boulder: music switches to the chase variant
  setPiece: { id: string; phase: string }; // free-form beats ('vault', 'start') for audio/juice
  // ---- hud (core/hud.ts) ----
  callout: { text: string; tone: 'good' | 'bad' | 'info' };
  react: { mood: 'nom' | 'wow' | 'ouch' | 'happy' | 'scared' };
  // ---- engine ----
  qualityChange: { quality: Quality };
  bigHit: { strength: number }; // 0..1, screen shake and music ducking
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
